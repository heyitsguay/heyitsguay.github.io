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
        scene: [MainScene, OverlayScene],
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

let ship, text;
let keys = null;
let accelForwardTime = 0;
let accelBackwardTime = 0;
let rotLeftTime = 0;
let rotRightTime = 0;

let projectiles;
let projectileLifespan = 6;
let projectileDrag = 0.996;
let projectileSpeedMax = 24;
let projectileSpeedMin = 7.5;
let projectileSpeed = projectileSpeedMax;
let fireRateMax = 8;
let fireRateMin = 2;
let fireRate = fireRateMax;
let timeSinceFire = 10;

let asteroids;
let pCrazyAsteroid;
let nAsteroids = 4;

let npcs;
let nNpcs = 1;

let powerups;
let effects = ['shield', 'triple'];
let activeEffects = {'shield': false,
                     'triple': false};
let projectileTypes = ['default', 'triple'];
let currentProjectile = 'default';

let canFire = true;
let toggled = {
    k: false,
    l: false,
    m: false,
    esc: false};

let godMode = false;

let endText;
let levelText;
let livesText;

let justWon = false;

let level = 0;

let lives = 3;

let gameIsPaused = false;

let cats;

let powerupCanAppear;

function asteroidCheck(e) {
    if (e.gameObjectB.parentObject instanceof Projectile) {
        e.gameObjectB.parentObject.alive = false;
        e.gameObjectA.parentObject.health -= 20;
    }
}


class OverlayScene extends Phaser.Scene {

    constructor() {
        super({key: 'OverlayScene', active: true});
    }

    create() {
        this.ownKeys = this.input.keyboard.addKeys(
            {esc: Phaser.Input.Keyboard.KeyCodes.ESC});
        this.cameras.main.resetFX();
        text = this.add.text(10, 10, 'Move: WASD.\nShoot: Space\n' + game.loop.actualFps, {font: '14px' +
            ' Arial', fill: '#CECED1'});
        endText = this.add.text(0, 0, '',
            {font: '120px Arial', fill: '#CECED1'});
        levelText = this.add.text(0, 0, 'Level ' + (level + 1),
            {font: '24px Arial', fill: '#CECED1'});
        levelText.setPosition(0.5 * (width - levelText.width), 10);
        livesText = this.add.text(0, 0, 'Lives: ' + lives,
            {font: '24px Arial', fill: '#CECED1'});
        livesText.setPosition(0.25 * width - 0.5 * livesText.width, 10);
        this.scene.bringToTop();
    }

    update(time, delta) {
        text.setText('Move: WASD.\nShoot: Space\n' + game.loop.actualFps.toFixed(1));

        if (this.ownKeys.esc.isDown) {
            if (!toggled['esc']) {
                toggled['esc'] = true;
                if (gameIsPaused) {
                    game.scene.resume('MainScene');
                    gameIsPaused = false;
                } else {
                    game.scene.pause('MainScene');
                    gameIsPaused = true;
                }
            }
        }
        else {
            toggled['esc'] = false;
        }
    }
}


class MainScene extends Phaser.Scene {

    constructor() {
        super({key: 'MainScene', active: true});
    }

    preload() {
        this.load.image('npcship', 'assets/npcship1.png')
        this.load.image('projectile', 'assets/bullet2.png');
        this.load.image('ship', 'assets/ship2.png');
        this.load.image('ship-shield', 'assets/ship2-shield.png');
        this.load.image('asteroid', 'assets/asteroid.png');
        this.load.image('crazyAsteroid', 'assets/asteroid2.png');
        this.load.image('particle', 'assets/particle3.png');
        this.load.image('powerup-triple', 'assets/powerup-fire-triple.png');
        this.load.image('powerup-shield', 'assets/powerup-aid-shield.png');
        this.cameras.main.setBackgroundColor('#000000');
    }

    create() {

        console.log(activeEffects);

        powerupCanAppear = true;

        if (cats === undefined) {
            cats = [];
            for (let i = 0; i < 3; i++) {
                cats.push(this.matter.world.nextCategory());
            }
        }

        pCrazyAsteroid = 0.05 + 0.02 * level;
        justWon = false;
        godMode = false;
        this.cameras.main.resetFX();
        powerups = [];
        projectiles = [];
        asteroids = [];
        this.matter.world.engine.positionIterations=10;
        this.matter.world.engine.velocityIterations=10;

        ship = this.matter.add.image(400, 300, 'ship');
        ship.setFrictionAir(0.993);
        ship.setCircle(9, 10, 10);
        ship.setBounce(0.4);
        ship.setCollisionCategory(cats[0]);
        ship.setCollidesWith(cats);
        ship.setMass(0.25);

        if (activeEffects['shield']) {
            applyShield();
        }

        ship.scene = this;

        for (let i = 0; i < nNpcs; i++) {
            let npc = this.matter.add.image(400, 300, 'npcship');
            npc.setFrictionAir(0.993);
            npc.setCircle(9, 10, 10);
            npc.setBounce(0.4);
            npc.setCollisionCategory(cats[0]);
            npc.setCollidesWith(cats);
            npc.setMass(0.25);
        }

        this.matterCollision.addOnCollideStart({
            objectA: ship,
            callback: eventData => {
                if (eventData.gameObjectB !== null
                    && !godMode
                    && !justWon
                    && !(eventData.gameObjectB.parentObject instanceof Powerup)) {
                    let ship = eventData.gameObjectA;
                    if (ship.visible) {
                        if (activeEffects['shield']) {
                            removeShield();
                        } else {
                            let explosion = ship.scene.add.particles('particle').createEmitter({
                                x: ship.x,
                                y: ship.y,
                                frequency: -1,
                                quantity: 1,
                                speed: {min: 0.5, max: 2},
                                angle: {min: 0, max: 360},
                                scale: {
                                    start: 0.12 * ship.scaleX,
                                    end: 4 * ship.scaleX
                                },
                                alpha: {start: 1, end: 0, ease: 'Sine.easeOut'},
                                lifespan: 500,
                                tint: 0xFF8800,
                                active: true
                            });
                            explosion.reserve(1);
                            explosion.explode();
                            lives -= 1;
                            ship.scene.time.delayedCall(
                                150,
                                () => {
                                    let dispText;
                                    if (lives < 1) {
                                        dispText = 'game over';
                                    } else {
                                        dispText = 'ded'
                                    }
                                    endText.setText(dispText);
                                    endText.setPosition(
                                        0.5 * (width - endText.width),
                                        0.5 * (height - endText.height));
                                },
                                [],
                                this);
                            if (lives < 1) {
                                ship.scene.time.delayedCall(
                                    2200,
                                    (s) => {
                                        s.scene.get('OverlayScene').cameras.main.fade(2300);
                                    },
                                    [ship.scene],
                                    this);
                            }
                            let restartTime;
                            if (lives < 1) {
                                restartTime = 6300;
                            } else {
                                restartTime = 4800;
                            }
                            ship.scene.time.delayedCall(
                                restartTime,
                                (s) => {
                                    if (lives < 1) {
                                        level = 0;
                                        lives = 3
                                    }
                                    s.restart();
                                    s.get('OverlayScene').scene.restart();

                                },
                                [ship.scene.scene],
                                this);
                            ship.setVisible(false);
                            currentProjectile = 'default';
                            for (let effect in activeEffects) {
                                activeEffects[effect] = false;
                            }
                        }
                        if (eventData.gameObjectB !== null) {
                            let parentB = eventData.gameObjectB.parentObject;
                            if (parentB instanceof Asteroid) {
                                parentB.explode();
                            } else if (parentB instanceof Projectile) {
                                parentB.destroy();
                            }
                        }
                    }
                }
            }});

        keys = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            space: Phaser.Input.Keyboard.KeyCodes.SPACE,
            shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
            k: Phaser.Input.Keyboard.KeyCodes.K,
            l: Phaser.Input.Keyboard.KeyCodes.L,
            m: Phaser.Input.Keyboard.KeyCodes.M,
            p: Phaser.Input.Keyboard.KeyCodes.P,
            one: Phaser.Input.Keyboard.KeyCodes.ONE,
            two: Phaser.Input.Keyboard.KeyCodes.TWO});

        for (let i = 0; i < nAsteroids + 4 * level; i++) {
            let x, y;
            let d = 0;
            while (d < 200) {
                x = Phaser.Math.Between(0, width);
                y = Phaser.Math.Between(0, height);
                d = Phaser.Math.Distance.Between(x, y, ship.x, ship.y);
            }
            let s = Phaser.Math.FloatBetween(0.8, 2.2);
            let isCrazy = between(0, 1) < pCrazyAsteroid;
            let a = new Asteroid(x, y, s, this, null, null, isCrazy);
        }

        console.log(activeEffects);

    }

    update(time, delta) {
        let time_s = time / 1000;
        let delta_s = delta / 1000;

        if (powerupCanAppear && time_s % 2 < 0.1 && between(0, 1) < 0.04) {
            powerupCanAppear = false;
            this.time.delayedCall(10000, () => {powerupCanAppear = true}, [], this);
            let possibleEffects = [];
            for (let effect of ['shield', 'triple']) {
                if (!activeEffects[effect]) {
                    possibleEffects.push('powerup-' + effect);
                }
            }
            let nPossible = possibleEffects.length;
            if (nPossible > 0) {
                let pEffect = 1 / nPossible;
                for (let i = 0; i < nPossible; i ++) {
                    if (between(0, 1) < (i + 1) * pEffect) {
                        addPowerup(this, possibleEffects[i]);
                        break;
                    }
                }
            }
        }

        updateInput(this, delta_s);

        if (justWon) {
            ship.setTint(hsv2int(between(0, 1), 1, 1));
        }

        timeSinceFire += delta_s;
        if (canFire) {
            let pauseMultiplier = Math.exp(timeSinceFire);
            projectileSpeed = Math.min(
                projectileSpeedMax,
                projectileSpeed + pauseMultiplier * delta_s);
            fireRate = Math.min(
                fireRateMax,
                fireRate + pauseMultiplier / 4 * delta_s);
        }

        wrap(ship);
        for (let projectile of projectiles) {
            projectile.update(delta_s);
        }
        for (let asteroid of asteroids) {
            asteroid.update(time_s, delta_s);
        }
        for (let powerup of powerups) {
            powerup.update(delta_s);
        }

        if (asteroids.length === 0) {
            endText.setText('win');
            endText.setPosition(
                0.5 * (width - endText.width),
                0.5 * (height - endText.height));
            justWon = true;
            this.time.delayedCall(
                6000,
                (s) => {
                    level += 1;
                    s.restart();
                    s.get('OverlayScene').scene.restart();
                },
                [this.scene],
                this);
        }
    }

}

function addPowerup(scene, type) {
    let _ = new Powerup(between(0, width), between(0, height), type, scene);
}

function updateInput(scene, delta) {
    if (!ship.visible) {
        return;
    }
    let shift = keys.shift.isDown;
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
        let a = shift? 2e-4 : 2e-3;
        let avLeft = a * (-10 - 180 * Math.min(rotLeftTime, 0.5));
        ship.setAngularVelocity(avLeft);
    }
    else if (keys.right.isDown) {
        rotRightTime += delta;
        rotLeftTime = 0;
        let a = shift? 2e-4 : 2e-3;
        let avRight = a * (10 + 180 * Math.min(rotRightTime, 0.5));
        ship.setAngularVelocity(avRight);
    }
    else {
        rotRightTime = 0;
        rotLeftTime = 0;
        ship.setAngularVelocity(0);
    }

    if (keys.k.isDown) {
        if (!toggled['k']) {
            toggled['k'] = true;
            if (currentProjectile === 'default') {
                activeEffects['triple'] = true;
                currentProjectile = 'triple';
            } else if (currentProjectile === 'triple') {
                currentProjectile = 'default';
            }
        }
    }
    else {
        toggled['k'] = false;
    }

    if (keys.l.isDown) {
        if (!toggled['l']) {
            toggled['l'] = true;
            for (let i = asteroids.length - 1; i >= 0; i--) {
                asteroids[i].explode();
            }
        }
    }
    else {
        toggled['l'] = false;
    }

    if (keys.m.isDown) {
        if (!toggled['m']) {
            toggled['m'] = true;
            godMode = !godMode;

            if (godMode) {
                ship.setTint(0x4fd8ff);
            } else {
                ship.setTint(0xffffff);
            }
        }
    }
    else {
        toggled['m'] = false;
    }

    if (keys.space.isDown) {
        if (canFire) {
            canFire = false;
            scene.time.delayedCall(1000 / fireRate, () => {canFire = true}, [], this);
            fire(scene);

        }
    }
    else {
        canFire = true;
    }

    if (keys.p.isDown) {
        addShield();
    }

    if (keys.one.isDown) {
        setProjectile('default');
    } else if(keys.two.isDown) {
        if (activeEffects['triple']) {
            setProjectile('triple');
        }
    }
}


class NPC {
    constructor(x, y, scale, scene, maxSpeed, heading=null) {
        // TODO: Base it off of Asteroid + ship properties. Start thinking about control :)
    }
}


class Asteroid {
    constructor(x, y, scale, scene, speed=null, heading=null, crazy=false) {
        if (speed === null) speed = between(0.2, 1);
        if (heading === null) heading = between(0, 2 * Math.PI);
        this.crazy = crazy;
        this.scale = scale;
        this.scene = scene;
        let image = this.crazy ? 'crazyAsteroid' : 'asteroid';
        this.sprite = this.scene.matter.add.image(x, y, image);
        this.sprite.parentObject = this;
        this.sprite.setCircle(50);
        this.sprite.setScale(this.scale);
        this.sprite.setBounce(0.);
        this.sprite.setVelocity(
            speed * Math.cos(heading),
            speed * Math.sin(heading));
        this.sprite.setFrictionAir(0);
        this.sprite.setFrictionStatic(0);
        this.sprite.setRotation(between(0, 2* Math.PI));
        this.health = 100;
        this.birthTime = this.scene.time.now / 1000;
        this.timeSinceVisible = 0;
        this.sprite.setCollisionCategory(cats[1]);
        this.sprite.setCollidesWith([cats[0], cats[1]]);
        this.sprite.setMass(this.scale * 1000);

        this.scene.matterCollision.addOnCollideStart({
            objectA: this.sprite,
            callback: eventData => {
                if (eventData.gameObjectB !== null) {
                    if (eventData.gameObjectB.parentObject instanceof Projectile) {
                        let projectileSpeed = eventData.gameObjectB.body.speed;
                        let damageMultiplier = 1;
                        if (projectileSpeed > 7) {
                            damageMultiplier = 1.2 + 0.2 * (projectileSpeed - 7);
                        }
                        eventData.gameObjectB.parentObject.alive = false;
                        eventData.gameObjectA.parentObject.health -=
                            projectileSpeed * damageMultiplier;
                    }
                }
            }
        });

        asteroids.push(this);
    }

    update(time, delta) {
        if (this.health <= 0) {
            this.explode()
        }
        else {
            if (this.crazy) {
                if (time - this.birthTime > 3 || this.health < 100) {
                    this.updateColor();
                    let x0 = this.sprite.getCenter().x;
                    let y0 = this.sprite.getCenter().y;
                    let x1 = ship.getCenter().x;
                    let y1 = ship.getCenter().y;
                    let headingToShip = Math.atan2(y1 - y0, x1 - x0);
                    let d = Math.sqrt((y1 - y0) ** 2 + (x1 - x0) ** 2);
                    let speed = Math.max(2, 100000 / (10000 + (d - 50 * this.scale) ** 2));
                    let v = vectorFromPolar(headingToShip, speed);
                    this.sprite.setVelocity(v.x, v.y);
                    let rNow = this.sprite.rotation;

                    this.sprite.setRotation(0.95 * rNow + 0.05 * headingToShip);
                } else {
                    let p = (time - this.birthTime) / 3;
                    let r = Math.floor((0.2 + 0.67 * p) * 255);
                    let g  = Math.floor((0.5 + 0.3 * p) * 255);
                    let tint = r * 256**2 + g * 256 + 255;
                    this.sprite.setTint(tint);
                }
            } else {
                this.updateColor();
            }
            wrap(this.sprite);

            let bounds = this.sprite.body.bounds;
            if (bounds.max.x < 0
                || bounds.min.x > width - 1
                || bounds.max.y < 0
                || bounds.min.y > height - 1) {
                this.timeSinceVisible += delta;
            } else {
                this.timeSinceVisible = 0;
            }

            if (this.timeSinceVisible > 5) {
                this.sprite.applyForce(vectorFromPolar(
                    between(0, 2 * Math.PI),
                    0.01 * this.sprite.body.mass));
                this.timeSinceVisible = 2.5;
            }

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
        if (!this.crazy && this.scale > 0.85) {
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
                let isCrazy = between(0, 1) < pCrazyAsteroid;
                let _ = new Asteroid(
                    this.sprite.getCenter().x + 0.4 * 100 * this.scale * Math.cos(heading),
                    this.sprite.getCenter().y + 0.4 * 100 * this.scale * Math.sin(heading),
                    scales[i],
                    this.scene,
                    speed,
                    heading,
                    isCrazy);
            }
        }
        let explosion = this.scene.add.particles('particle').createEmitter({
            x: this.sprite.x,
            y: this.sprite.y,
            frequency: -1,
            quantity: 1,
            speed: {min: 0.5, max: 2},
            angle: {min: 0, max: 360},
            scale: {start: 0.12 * this.scale, end: 4 * this.scale},
            alpha: {start: 1, end: 0, ease: 'Sine.easeOut'},
            lifespan: 500,
            tint: 0xFF8800,
            active: true
        });
        explosion.reserve(1);
        explosion.explode();
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


let powerupCategories = {
    'powerup-shield': 'aid',
    'powerup-triple': 'fire'};

class Powerup {
    constructor(x, y, type, scene) {
        this.scene = scene;
        this.type = type;
        this.category = powerupCategories[this.type];
        this.age = 0;
        this.lifespan = 30;
        this.scale = 0.35;
        this.alive = true;

        this.sprite = scene.matter.add.image(x, y, this.type);
        this.sprite.parentObject = this;
        this.sprite.setCircle(32);
        this.sprite.setScale(this.scale);

        this.sprite.setCollisionCategory(cats[2]);
        this.sprite.setCollidesWith([cats[0]]);

        this.scene.matterCollision.addOnCollideStart({
            objectA: this.sprite,
            callback: eventData => {
                if (eventData.gameObjectB !== null) {
                    this.powerup();
                    this.destroy();
                }
            }
        });

        powerups.push(this);
    }

    destroy() {
        this.sprite.destroy();
        remove(this, powerups);
    }

    powerup() {
        if (this.category === 'aid') {
            this.scene.cameras.main.flash(333, 128, 128, 255);
        } else if (this.category === 'fire') {
            this.scene.cameras.main.flash(333, 255, 128, 128);
        }

        if (this.type === 'powerup-shield') {
            addShield();
        } else if (this.type === 'powerup-triple') {
            activeEffects['triple'] = true;
            setProjectile('triple');
        }
    }

    update(delta) {
        if (this.alive) {
            this.age += delta;
            this.updateColor();
            if (this.age > this.lifespan) {
                this.alive = false;
            }
        }
        else {
            this.destroy();
        }
    }

    updateColor() {
        let tintFactor = 0.8 + 0.2 * Math.cos(10 * this.age);
        let r, g, b;
        r = g = b = tintFactor * 255;
        if (this.category === 'aid') {
            b /= tintFactor;
        } else if (this.category === 'fire') {
            r /= tintFactor;
        }
        let tint = Math.round(r) * 256 **2 + Math.round(g) * 256 + Math.round(b);
        this.sprite.setTint(tint);
    }
}


class Projectile {
    constructor(x, y, scene) {
        this.scene = scene;

        this.age = 0;
        this.scale = 0.16;
        this.alpha = 1;

        let tint;
        if (justWon) {
            tint = hsv2int(between(0, 1), 1, 1);
        } else {
            tint = 0xFF8800;
        }

        this.particles = this.scene.add.particles('particle');
        this.emitter = this.particles.createEmitter({
            x: x,
            y: y,
            frequency: 50,
            quantity: 1,
            speed: {min: 1, max: 10},
            angle: {min: 0, max: 360},
            scale: {start: 0.72 * this.scale, end: 0.72 * this.scale},
            alpha: {start: 1, end: 0},
            lifespan: 1000,
            tint: tint,
            active: true
        });
        this.emitter.reserve(500);

        this.sprite = scene.matter.add.image(x, y, 'projectile');
        this.sprite.parentObject = this;
        this.sprite.setScale(1.28);
        // this.sprite.setScale(8 * this.scale);
        this.sprite.setCircle(3);
        this.sprite.setMass(0.015);
        this.sprite.setBounce(1.);

        this.sprite.setCollisionCategory(cats[1]);
        this.sprite.setCollidesWith([cats[0], cats[1]]);

        this.alive = true;

        projectiles.push(this);
    }

    setVelocity(x, y) {
        this.sprite.setVelocity(x, y);
    }

    update(delta) {
        if (this.alive) {
            this.age += delta;
            if (this.age > projectileLifespan) {
                this.alive = false;
            } else {
                let v = this.sprite.body.velocity;
                let p = this.age / projectileLifespan;
                this.emitter.setPosition(
                    this.sprite.x,
                    this.sprite.y);
                if (p > 0.4) {
                    this.emitter.setScale(0.72 * this.scale);
                    this.scale *= 0.992;
                }
                this.setVelocity(projectileDrag * v.x, projectileDrag * v.y);
                // wrap(this.sprite);
                this.updateColor();
            }
        } else {
            this.destroy();
        }
    }

    destroy() {
        this.particles.destroy();
        this.sprite.destroy();
        remove(this, projectiles);
    }

    updateColor() {
        let p = Math.min(1, this.age / (projectileLifespan - 2));
        let h = 0.167 * (1 - p) ** 2;
        let s = Math.min(1, 0.1 + 1.2 * p ** .5);
        let v = 0.2 + 0.8 * (1 - p) ** 0.8;
        let tint = hsv2int(h, s, v);
        this.sprite.setTint(tint);
    }
}


function fire(scene) {

    if (currentProjectile === 'default') {
        let p = oneProjectile(scene, ship.rotation, projectileSpeed, 2e-6);
    } else if (currentProjectile === 'triple') {
        let p0 = oneProjectile(scene, ship.rotation, projectileSpeed, 2e-6);
        let p1 = oneProjectile(scene, ship.rotation - 0.20944, 0.9 * projectileSpeed, 5e-7);
        let p2 = oneProjectile(scene, ship.rotation + 0.20944, 0.9 * projectileSpeed, 5e-7);
    }
    if (!godMode) {
        projectileSpeed = Math.max(projectileSpeedMin, projectileSpeed - 1.3);
        fireRate = Math.max(fireRateMin, fireRate - 0.33);
    }
}


function oneProjectile(scene, heading, speed, cRecoil) {
    let ct = Math.cos(heading);
    let st = Math.sin(heading);
    let x = ship.getCenter().x + 17 * ct;
    let y = ship.getCenter().y + 17 * st;
    let projectile = new Projectile(x, y, scene);
    let svx = ship.body.velocity.x;
    let svy = ship.body.velocity.y;
    projectile.setVelocity(svx + speed * ct, svy + speed * st);
    let r = cRecoil * projectileSpeed;
    let recoil = new Phaser.Math.Vector2(
        -r * projectile.sprite.body.velocity.x,
        -r * projectile.sprite.body.velocity.y);
    if (!godMode) {
        ship.applyForce(recoil);
    }
    return projectile;
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

function hsv2int(h, s, v) {
    let c = Phaser.Display.Color.HSVToRGB(h, s, v);
    return c.r * 256**2 + c.g * 256 + c.b;
}


function addShield() {
    if (!activeEffects['shield']) {
        activeEffects['shield'] = true;
        applyShield();
    }
}


function applyShield() {
    let r = ship.rotation;
    let v = ship.body.velocity;
    ship.setTexture('ship-shield');
    ship.setCircle(18, 1, 1);
    // ship.setCircle(9, 10, 10);
    ship.setRotation(r);
    ship.setVelocity(v.x, v.y);
    ship.setCollisionCategory(cats[0]);
    ship.setCollidesWith(cats);
    ship.setMass(0.25)
}


function removeShield() {
    if (activeEffects['shield']) {
        activeEffects['shield'] = false;
        let r = ship.rotation;
        let v = ship.body.velocity;
        ship.setTexture('ship');
        ship.setCircle(9, 10, 10);
        ship.setRotation(r);
        ship.setVelocity(v.x, v.y);
        ship.setCollisionCategory(cats[0]);
        ship.setCollidesWith(cats);
        ship.setMass(0.25)
    }
}


function setProjectile(key) {
    currentProjectile = key;
}