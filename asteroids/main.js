let config, game;
$(document).ready(function() {
    const width = Math.min(1280, window.innerWidth);
    const height = Math.min(1280, window.innerHeight);
    config = {
        type: Phaser.AUTO,
        width: width,
        height: height,
        backgroundColor: '#22222A',
        parent: 'game-container',
        scene: {
            preload: preload,
            create: create,
            update: update
        },
        physics: {
            default: 'arcade',
            arcade: {
                fps: 60,
                gravity: {y: 0}
            }
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
let bulletGroup;
let bulletLifespan = 10;
let bulletDrag = 0.995;

class Bullet {
    constructor(x, y, scene) {
        this.sprite = bulletGroup.create(x, y, 'bullet');
        this.sprite.setCircle(3);
        this.sprite.setMass(0.1);
        this.sprite.setDamping(false);
        this.sprite.setMaxVelocity(1000);
        this.age = 0;
        this.scene = scene;
        bullets.push(this);
    }

    setVelocity(x, y) {
        this.sprite.setVelocity(x, y);
    }

    update(delta) {
        this.age += delta;
        if (this.age > bulletLifespan) {
            let idx = bullets.indexOf(this);
            bullets.splice(idx, 1);
            bulletGroup.remove(this.sprite, true, true);
        } else {
            let v = this.sprite.body.velocity;
            this.setVelocity(bulletDrag * v.x, bulletDrag * v.y);
            this.scene.physics.world.wrap(this.sprite, 16);
            this.updateColor();
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
        console.log(this.sprite.tint);
    }
}

function preload() {
    this.load.image('bullet', 'assets/bullet2.png');
    this.load.image('ship', 'assets/ship.png');
    this.cameras.main.setBackgroundColor('#000000');
}

function create() {
    ship = this.physics.add.image(400, 300, 'ship');
    ship.setDamping(true);
    ship.setDrag(0.993);
    ship.setMass(100);
    ship.setMaxVelocity(300);
    ship.setCircle(9, 7, 7);
    ship.setBounce(0.);

    keys = this.input.keyboard.addKeys(
        {up: Phaser.Input.Keyboard.KeyCodes.W,
         down: Phaser.Input.Keyboard.KeyCodes.S,
         left: Phaser.Input.Keyboard.KeyCodes.A,
         right: Phaser.Input.Keyboard.KeyCodes.D,
         space: Phaser.Input.Keyboard.KeyCodes.SPACE});

    bulletGroup = this.physics.add.group({
        bounceX: 1,
        bounceY: 1,
        collideWorldBounds: false
    });
    this.physics.add.collider(bulletGroup, bulletGroup);
    this.physics.add.collider(bulletGroup, ship);

    text = this.add.text(10, 10, '', {font: '16px Courier', fill: '#CECED1'});
}

let canFire = true;
function update(time, delta) {
    let delta_s = delta / 1000;
    if (keys.up.isDown) {
        accelForwardTime += delta_s;
        accelBackwardTime = 0;
        let acceleration = 30 + Math.min(accelForwardTime, 1) * 270;
        this.physics.velocityFromRotation(
            ship.rotation,
            acceleration,
            ship.body.acceleration);
    } else if (keys.down.isDown) {
        accelForwardTime = 0;
        accelBackwardTime += delta_s;
        let acceleration = 30 + Math.min(accelBackwardTime, 1) * 220;
        this.physics.velocityFromRotation(
            ship.rotation,
            -acceleration,
            ship.body.acceleration);
    } else {
        ship.setAcceleration(0);
        accelForwardTime = 0;
        accelBackwardTime = 0;
    }

    if (keys.left.isDown) {
        rotLeftTime += delta_s;
        rotRightTime = 0;
        let avLeft = -20 - 430 * Math.min(rotLeftTime, 1);
        ship.setAngularVelocity(avLeft);
    }
    else if (keys.right.isDown) {
        rotRightTime += delta_s;
        rotLeftTime = 0;
        let avRight = 20 + 430 * Math.min(rotRightTime, 1);
        ship.setAngularVelocity(avRight);
    }
    else {
        rotRightTime = 0;
        rotLeftTime = 0;
        ship.setAngularVelocity(0);
    }

    // text.setText('Time: ' + time / 1000);

    if (keys.space.isDown) {
        if (canFire) {
            canFire = false;
            fireBullet(this);

        }
    }
    else {
        canFire = true;
    }

    this.physics.world.wrap(ship, 16);
    for (let bullet of bullets) {
        bullet.update(delta_s);
    }

}


function fireBullet(scene) {
    let ct = Math.cos(ship.rotation);
    let st = Math.sin(ship.rotation);
    let emitX = ship.body.center.x + 17 * ct;
    let emitY = ship.body.center.y + 17 * st;
    let bullet = new Bullet(emitX, emitY, scene);
    bullet.setVelocity(666 * ct, 666 * st);
}