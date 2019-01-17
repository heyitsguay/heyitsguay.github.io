export default class Player {
    constructor(scene, x, y) {
        this.scene = scene;

        // Create animations from the player spritesheet
        const anims = scene.anims;
        anims.create({
            key: 'player-idle',
            frames: anims.generateFrameNumbers('player', {start: 0, end: 3}),
            frameRate: 3,
            repeat: -1
        });
        anims.create({
            key: 'player-run',
            frames: anims.generateFrameNumbers('player', {start: 8, end: 15}),
            frameRate: 12,
            repeat: -1
        });

        // Create the player physics sprite
        this.sprite = scene.physics.add
            .sprite(x, y, 'player', 0)
            .setDrag(800, 0)
            .setMaxVelocity(200, 500);

        // Create keys to track
        const {SHIFT, SPACE, LEFT, RIGHT, UP, DOWN, W, A, S, D, H} =
            Phaser.Input.Keyboard.KeyCodes;
        this.keys = scene.input.keyboard.addKeys({
            shift: SHIFT,
            space: SPACE,
            left: LEFT,
            right: RIGHT,
            up: UP,
            down: DOWN,
            w: W,
            a: A,
            s: S,
            d: D,
            h: H
        });
    }

    freeze() {
        this.sprite.body.moves = false;
    }

    update(time, delta) {
        const keys = this.keys;
        const sprite = this.sprite;
        const onGround = sprite.body.blocked.down;
        const baseMaxV = 200;
        const deltaMaxV = 300;
        let maxVDecay = 0.95;
        let accelerationX = onGround ? 600 : 600;
        // Corner faster
        if (Math.sign(accelerationX) * Math.sign(this.sprite.body.velocity.x) < -1) {
            accelerationX *= 1.8
        }
        // Use shift to run faster
        if (keys.shift.isDown) {
            accelerationX *= 1.5;
            this.sprite.setMaxVelocity(baseMaxV + deltaMaxV, 400);
        } else {
            const currentMaxV = this.sprite.body.maxVelocity.x;
            const currentDeltaV = currentMaxV - baseMaxV;
            const newMaxV = currentDeltaV > 0 ?
                baseMaxV + maxVDecay * currentDeltaV :
                baseMaxV;
            this.sprite.setMaxVelocity(newMaxV, 400);
        }
        const velocityJump = -500;
        const accelerationUp = -300;
        const accelerationDown = 50;

        // Update movement
        if (Phaser.Input.Keyboard.JustDown(keys.h)) {
            const isTextVisible = this.scene.helpText.visible;
            this.scene.helpText.setVisible(!isTextVisible);
        }

        // Apply horizontal acceleration when left/a or right/d are applied
        if (keys.left.isDown || keys.a.isDown) {
            sprite.setAccelerationX(-accelerationX);
            // No need for separate graphics when running to the left or
            // right. Just mirror the sprite when running left
            sprite.setFlipX(true);
        } else if (keys.right.isDown || keys.d.isDown) {
            sprite.setAccelerationX(accelerationX);
            sprite.setFlipX(false);
        } else {
            sprite.setAccelerationX(0);
        }

        // Apply vertical acceleration
        if (keys.up.isDown || keys.w.isDown || keys.space.isDown) {
            if (onGround) {
                // Jump
                sprite.setVelocityY(velocityJump);
            } else {
                sprite.setAccelerationY(accelerationUp);
            }
        } else if (keys.down.isDown || keys.s.isDown) {
            if (!onGround) {
                sprite.setAccelerationY(accelerationDown);
            }
        } else {
            sprite.setAccelerationY(0);
        }

        // Update animation
        if (onGround) {
            if (sprite.body.velocity.x !== 0) {
                sprite.anims.play('player-run', true);
            } else sprite.anims.play('player-idle', true);
        } else {
            sprite.anims.stop();
            sprite.setTexture('player', 10);
        }
    }

    destroy() {
        this.sprite.destroy();
    }
}