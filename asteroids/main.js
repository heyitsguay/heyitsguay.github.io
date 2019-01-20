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

let bullets = [];
let bulletLifespan = 10;
let bulletDrag = 0.995;

let asteroids = [];
let asteroidDrag = 0.993;

let canFire = true;

class MainScene extends Phaser.Scene {
    preload() {
        this.load.image('bullet', 'assets/bullet2.png');
        this.load.image('ship', 'assets/ship.png');
        this.load.image('asteroid', 'assets/asteroid.png');
        this.cameras.main.setBackgroundColor('#000000');
    }

    create() {
        this.matter.world.engine.positionIterations=12;
        this.matter.world.engine.velocityIterations=12;

        ship = this.matter.add.image(400, 300, 'ship');
        ship.setFrictionAir(0.993);
        ship.setMass(1000);
        ship.setCircle(9, 7, 7);
        ship.setBounce(0.4);

        keys = this.input.keyboard.addKeys(
            {up: Phaser.Input.Keyboard.KeyCodes.W,
                down: Phaser.Input.Keyboard.KeyCodes.S,
                left: Phaser.Input.Keyboard.KeyCodes.A,
                right: Phaser.Input.Keyboard.KeyCodes.D,
                space: Phaser.Input.Keyboard.KeyCodes.SPACE});

        let nAsteroids = 10;
        for (let i = 0; i < nAsteroids; i++) {
            let x, y;
            let d = 0;
            while (d < 70) {
                x = Phaser.Math.Between(0, width);
                y = Phaser.Math.Between(0, height);
                d = Phaser.Math.Distance.Between(x, y, ship.x, ship.y);
            }
            let s = Phaser.Math.FloatBetween(0.25, 1.3);
            let a = new Asteroid(x, y, s, this);
        }

        text = this.add.text(10, 10, 'Move: WASD.\nShoot: Space\n' + game.loop.actualFps, {font: '16px' +
            ' Courier', fill: '#CECED1'});

        this.matterCollision.addOnCollideStart({
            objectA: asteroids.map(a => a.sprite),
            callback: eventData => {
                const {bodyB, gameObjectB} = eventData;
                if (eventData.gameObjectB.parentObject instanceof Bullet) {
                    eventData.gameObjectB.parentObject.alive = false;
                    eventData.gameObjectA.parentObject.health -= 20;
                    console.log('bork');
                }
            }
        });
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
            fireBullet(scene);

        }
    }
    else {
        canFire = true;
    }
}


class Asteroid {
    constructor(x, y, s, scene) {
        this.sprite = scene.matter.add.image(x, y, 'asteroid');
        this.sprite.parentObject = this;
        this.sprite.setCircle(50);
        this.sprite.setMass(s * 1000);
        this.sprite.setScale(s);
        this.sprite.setBounce(0.4);
        this.alive = true;
        this.health = 100;

        asteroids.push(this);
    }

    update(delta) {
        if (this.health <= 0) {
            this.alive = false;
        }
        if (this.alive) {
            let v = this.sprite.body.velocity;
            this.sprite.setVelocity(asteroidDrag * v.x, asteroidDrag * v.y);
            wrap(this.sprite);
            this.updateColor();
        } else {
            this.sprite.destroy();
            remove(this, asteroids);
        }
    }

    updateColor() {
        let p = 255 * this.health / 100;
        let tint_int = 255 * 256 * 256 + p * 257;
        this.sprite.setTint(tint_int);
    }
}


class Bullet {
    constructor(x, y, scene) {
        this.sprite = scene.matter.add.image(x, y, 'bullet');
        this.sprite.parentObject = this;
        this.sprite.setCircle(3);
        this.sprite.setMass(0.1);
        this.sprite.setBounce(0.8);
        this.age = 0;
        this.scene = scene;
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
                let idx = bullets.indexOf(this);
                bullets.splice(idx, 1);
                this.sprite.destroy();
            } else {
                let v = this.sprite.body.velocity;
                this.setVelocity(bulletDrag * v.x, bulletDrag * v.y);
                wrap(this.sprite);
                this.updateColor();
            }
        } else {
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
}


function remove(obj, array) {
    let index = array.indexOf(obj);
    array.splice(index, 1);
}


function wrap(obj) {
    let x = obj.x;
    let y = obj.y;
    let dx = 0;
    let dy = 0;
    let b = obj.body.bounds;
    if (b.max.y <= 0) {
        dy = height + (b.max.y - b.min.y);
    }
    if (b.min.y >= height) {
        dy = -height - (b.max.y - b.min.y);
    }
    if (b.max.x <= 0) {
        dx = width + (b.max.x - b.min.x);
    }
    if (b.min.x >= width) {
        dx = -width - (b.max.x - b.min.x);
    }
    obj.setPosition(x + dx, y + dy);
}


function vectorFromPolar(rotation, magnitude) {
    return new Phaser.Math.Vector2(
        magnitude * Math.cos(rotation),
        magnitude * Math.sin(rotation));
}