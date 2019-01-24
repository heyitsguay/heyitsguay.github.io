let config, game;
let width, height;
$(document).ready(function() {
    width = window.innerWidth;
    height = window.innerHeight;
    config = {
        type: Phaser.AUTO,
        width: width,
        height: height,
        backgroundColor: '#22222A',
        parent: 'game-container',
        scene: MainScene,
        physics: {
            default: 'matter',
            matter: {
                fps: 60,
                gravity: {y: 0}
            }
        },
        plugins: {
            scene: [{
                plugin: PhaserMatterCollisionPlugin,
                key: "matterCollision",
                mapping: "matterCollision"
            }]
        }
    };
    game = new Phaser.Game(config)
});

let ship, keys, text;
let accelForwardTime = 0;
let accelBackwardTime = 0;
let rotLeftTime = 0;
let rotRightTime = 0;

let bullets;
let bulletLifespan = 10;
let bulletDrag = 0.995;

let asteroids;
let asteroidDrag = 1;
let nAsteroids = 18;

let canFire = true;

function asteroidCheck(e) {
    if (e.gameObjectB.parentObject instanceof Bullet) {
        e.gameObjectB.parentObject.alive = false;
        e.gameObjectA.parentObject.health -= 20;
    }
}

class MainScene extends Phaser.Scene {
    preload() {
        this.load.image('bullet', 'assets/bullet2.png');
        this.load.image('ship', 'assets/ship.png');
        this.load.image('asteroid', 'assets/asteroid.png');
        this.load.image('particle', 'assets/particle2.png');
        this.cameras.main.setBackgroundColor('#000000');
    }

    create() {
        bullets = [];
        asteroids = [];
        this.matter.world.engine.positionIterations=10;
        this.matter.world.engine.velocityIterations=10;

        ship = this.matter.add.image(400, 300, 'ship');
        ship.setFrictionAir(0.993);
        ship.setMass(1000);
        ship.setCircle(9, 7, 7);
        ship.setBounce(0.4);
        ship.scene = this;

        this.matterCollision.addOnCollideStart({
            objectA: ship,
            callback: eventData => {
                let ship = eventData.gameObjectA;
                let explosion = ship.scene.add.particles('particle').createEmitter({
                    x: ship.x,
                    y: ship.y,
                    frequency: -1,
                    quantity: 1,
                    speed: {min: 0.5, max: 2},
                    angle: {min: 0, max: 360},
                    scale: {start: 0.4 * ship.scaleX, end: 10 * ship.scaleX},
                    alpha: {start: 1, end: 0, ease: 'Sine.easeOut'},
                    lifespan: 500,
                    tint: 0xFF8800,
                    active: true
                });
                explosion.reserve(1);
                explosion.explode();
                ship.scene.time.delayedCall(
                    1000,
                    (s) => {s.restart()},
                    [ship.scene.scene],
                    this);
                ship.setVisible(false);
            }});

        keys = this.input.keyboard.addKeys(
            {up: Phaser.Input.Keyboard.KeyCodes.W,
                down: Phaser.Input.Keyboard.KeyCodes.S,
                left: Phaser.Input.Keyboard.KeyCodes.A,
                right: Phaser.Input.Keyboard.KeyCodes.D,
                space: Phaser.Input.Keyboard.KeyCodes.SPACE});

        for (let i = 0; i < nAsteroids; i++) {
            let x, y;
            let d = 0;
            while (d < 70) {
                x = Phaser.Math.Between(0, width);
                y = Phaser.Math.Between(0, height);
                d = Phaser.Math.Distance.Between(x, y, ship.x, ship.y);
            }
            let s = Phaser.Math.FloatBetween(0.2, 2);
            let a = new Asteroid(x, y, s, this);
        }

        text = this.add.text(10, 10, 'Move: WASD.\nShoot: Space\n' + game.loop.actualFps, {font: '16px' +
            ' Courier', fill: '#CECED1'});

    }

    update(time, delta) {
        let delta_s = delta / 1000;

        updateInput(this, delta_s);

        text.setText('Move: WASD.\nShoot: Space\n' + game.loop.actualFps.toFixed(1));

        wrap(ship);
        for (let bullet of bullets) {
            bullet.update(delta_s);
        }
        for (let asteroid of asteroids) {
            asteroid.update(delta_s);
        }
    }

}

function updateInput(scene, delta) {
    if (!ship.visible) return;
    if (keys.up.isDown) {
        accelForwardTime += delta;
        accelBackwardTime = 0;
        let acceleration = 3e-7 * (30 + Math.min(accelForwardTime, 1) * 270);
        ship.applyForce(vectorFromPolar(ship.rotation, acceleration));
    } else if (keys.down.isDown) {
        accelForwardTime = 0;
        accelBackwardTime += delta;
        let acceleration = 3e-7 * (30 + Math.min(accelBackwardTime, 1) * 220);
        ship.applyForce(vectorFromPolar(ship.rotation, -acceleration));
    } else {
        accelForwardTime = 0;
        accelBackwardTime = 0;
    }

    if (keys.left.isDown) {
        rotLeftTime += delta;
        rotRightTime = 0;
        let avLeft = 1e-3 * (-10 - 180 * Math.min(rotLeftTime, 0.5));
        ship.setAngularVelocity(avLeft);
    }
    else if (keys.right.isDown) {
        rotRightTime += delta;
        rotLeftTime = 0;
        let avRight = 1e-3 * (10 + 180 * Math.min(rotRightTime, 0.5));
        ship.setAngularVelocity(avRight);
    }
    else {
        rotRightTime = 0;
        rotLeftTime = 0;
        ship.setAngularVelocity(0);
    }

    if (keys.space.isDown) {
        if (canFire) {
            canFire = false;
            scene.time.delayedCall(133, () => {canFire = true}, [], this);
            fireBullet(scene);

        }
    }
    else {
        canFire = true;
    }
}


class Asteroid {
    constructor(x, y, scale, scene, speed=null, heading=null) {
        if (speed === null) speed = between(0.2, 1);
        if (heading === null) heading = between(0, 2 * Math.PI);
        this.scale = scale;
        this.scene = scene;
        this.sprite = this.scene.matter.add.image(x, y, 'asteroid');
        this.sprite.parentObject = this;
        this.sprite.setCircle(50);
        this.sprite.setMass(this.scale * 1000);
        this.sprite.setScale(this.scale);
        this.sprite.setBounce(0.);
        this.sprite.setVelocity(
            speed * Math.cos(heading),
            speed * Math.sin(heading));
        this.sprite.setFrictionAir(0);
        this.sprite.setFrictionStatic(0);
        this.health = 100;

        this.scene.matterCollision.addOnCollideStart({
            objectA: this.sprite,
            callback: eventData => {
                if (eventData.gameObjectB.parentObject instanceof Bullet) {
                    let bulletSpeed = eventData.gameObjectB.body.speed;
                    let damageMultiplier = 1;
                    if (bulletSpeed > 10) {
                        damageMultiplier = 1 + 0.2 * (bulletSpeed - 10);
                    }
                    eventData.gameObjectB.parentObject.alive = false;
                    eventData.gameObjectA.parentObject.health -=
                        bulletSpeed * damageMultiplier;
                }
            }
        });

        asteroids.push(this);
    }

    update(delta) {
        if (this.health <= 0) {
            this.explode()
        }
        else {
            let v = this.sprite.body.velocity;
            this.sprite.setVelocity(asteroidDrag * v.x, asteroidDrag * v.y);
            wrap(this.sprite);
            this.updateColor();

        }
    }

    updateColor() {
        let p = Math.floor(255 * this.health / 100);
        let tint_int = 255 * 256 * 256 + p * 257;
        this.sprite.setTint(tint_int);
    }

    destroy() {
        this.sprite.destroy();
        remove(this, asteroids);
    }

    explode() {
        if (this.scale > 0.85) {
            let s1 = between(0.7, 1.3);
            let s2 = 2 - s1;
            let newScale1 = s1 * this.scale / 2;
            let newScale2 = s2 * this.scale / 2;
            let scales = [newScale1, newScale2];
            for (let i in scales) {
                let newHeading = between(0, 2 * Math.PI);
                let newSpeed = between(0.25, 0.4) / scales[i];
                let v = this.sprite.body.velocity;
                let oldSpeed = Math.sqrt(v.x**2 + v.y**2);
                let oldHeading = Math.atan2(v.y, v.x);
                let {speed, heading} = addPolar(
                    oldSpeed, oldHeading, newSpeed, newHeading);
                let _ = new Asteroid(
                    this.sprite.getCenter().x + 0.4 * 100 * this.scale * Math.cos(heading),
                    this.sprite.getCenter().y + 0.4 * 100 * this.scale * Math.sin(heading),
                    scales[i],
                    this.scene,
                    speed,
                    heading);
            }
        }
        let explosion = this.scene.add.particles('particle').createEmitter({
            x: this.sprite.x,
            y: this.sprite.y,
            frequency: -1,
            quantity: 1,
            speed: {min: 0.5, max: 2},
            angle: {min: 0, max: 360},
            scale: {start: 0.4 * this.scale, end: 10 * this.scale},
            alpha: {start: 1, end: 0, ease: 'Sine.easeOut'},
            lifespan: 500,
            tint: 0xFF8800,
            active: true
        });
        explosion.reserve(1);
        explosion.explode();
        // this.scene.time.delayedCall(500, explodeEmitter, [explosion], this);
        this.destroy();


    }


}


function explodeEmitter(e) {
    e.explode();
}


function addPolar(r1, t1, r2, t2) {
    let st = Math.sin(t2 - t1);
    let ct = Math.cos(t2 - t1);
    let r = Math.sqrt(r1**2 + r2**2 + 2*r1*r2*ct);
    let t = t1 + Math.atan2(r2 * st, r1 + r2 * ct);
    return {speed: r, heading: t};
}


class Bullet {
    constructor(x, y, scene) {
        this.scene = scene;

        this.age = 0;
        this.scale = 0.5;
        this.alpha = 1;

        this.particles = this.scene.add.particles('particle');
        this.emitter = this.particles.createEmitter({
            x: x,
            y: y,
            frequency: 50,
            quantity: 1,
            speed: {min: 1, max: 10},
            angle: {min: 0, max: 360},
            scale: {start: this.scale, end: this.scale},
            alpha: {start: 1, end: 0},
            lifespan: 1000,
            tint: 0xFF8800,
            active: true
        });
        this.emitter.reserve(500);

        this.sprite = scene.matter.add.image(x, y, 'bullet');
        this.sprite.parentObject = this;
        this.sprite.setCircle(3);
        this.sprite.setMass(0.025);
        this.sprite.setBounce(0.4);

        this.alive = true;

        bullets.push(this);
    }

    setVelocity(x, y) {
        this.sprite.setVelocity(x, y);
    }

    update(delta) {
        if (this.alive) {
            this.age += delta;
            if (this.age > bulletLifespan) {
                this.alive = false;
            } else {
                let v = this.sprite.body.velocity;
                let p = this.age / bulletLifespan;
                this.emitter.setPosition(
                    this.sprite.x,
                    this.sprite.y);
                if (p > 0.4) {
                    this.emitter.setScale(this.scale);
                    this.scale *= 0.992;
                }
                this.setVelocity(bulletDrag * v.x, bulletDrag * v.y);
                wrap(this.sprite);
                this.updateColor();
            }
        } else {
            this.particles.destroy();
            this.sprite.destroy();
            remove(this, bullets);
        }
    }

    updateColor() {
        let p = Math.min(1, this.age / (bulletLifespan - 2));
        let h = 0.167 * (1 - p) ** 2;
        let s = Math.min(1, 0.1 + 1.2 * p ** .5);
        let v = 0.2 + 0.8 * (1 - p) ** 0.8;
        let tint = Phaser.Display.Color.HSVToRGB(h, s, v);
        let tint_int = tint.r  * 256 * 256 + tint.g * 256 + tint.b;
        this.sprite.setTint(tint_int);
    }
}


function fireBullet(scene) {
    let ct = Math.cos(ship.rotation);
    let st = Math.sin(ship.rotation);
    let emitX = ship.getCenter().x + 17 * ct;
    let emitY = ship.getCenter().y + 17 * st;
    let bullet = new Bullet(emitX, emitY, scene);
    bullet.setVelocity(
        ship.body.velocity.x + 20 * ct,
        ship.body.velocity.y + 20 * st);
    let recoil = new Phaser.Math.Vector2(
        -0.00004 * bullet.sprite.body.velocity.x,
        -0.00004 * bullet.sprite.body.velocity.y);
    ship.applyForce(recoil);
}


function between(a, b) {
    return Phaser.Math.FloatBetween(a, b);
}


function betweeni(a, b) {
    return Phaser.Math.Between(a, b);
}


function remove(obj, array) {
    let index = array.indexOf(obj);
    array.splice(index, 1);
}


function wrap(obj) {
    let extra = 50;
    let x0 = -extra;
    let y0 = -extra;
    let x1 = width + extra;
    let y1 = height + extra;
    let x = obj.x;
    let y = obj.y;
    let dx = 0;
    let dy = 0;
    let b = obj.body.bounds;
    if (b.max.y <= y0) {
        dy = height + extra + (b.max.y - b.min.y);
    }
    if (b.min.y >= y1) {
        dy = -height - extra - (b.max.y - b.min.y);
    }
    if (b.max.x <= x0) {
        dx = width + extra + (b.max.x - b.min.x);
    }
    if (b.min.x >= x1) {
        dx = -width - extra - (b.max.x - b.min.x);
    }
    obj.setPosition(x + dx, y + dy);
}


function vectorFromPolar(rotation, magnitude) {
    return new Phaser.Math.Vector2(
        magnitude * Math.cos(rotation),
        magnitude * Math.sin(rotation));
}