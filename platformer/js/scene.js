import Player from './player.js';
import MouseTileMarker from './mouse-tile-marker.js';

/**
 * Extend Phaser.Scene, wrap the core platformer logic
 */
export default class PlatformerScene extends Phaser.Scene {
    preload() {
        this.load.spritesheet(
            'player',
            'assets/spritesheets/0x72-industrial-player-32px-extruded.png',
            {
                frameWidth: 32,
                frameHeight: 32,
                margin: 1,
                spacing: 2
            }
        );
        this.load.image(
            'spike',
            'assets/images/0x72-industrial-spike.png');
        this.load.image(
            'tiles',
            'assets/tilesets/0x72-industrial-tileset-32px-extruded.png');
        this.load.tilemapTiledJSON(
            'map',
            'assets/tilemaps/platformer.json');
    }

    create() {
        this.isPlayerDead = false;

        const map = this.make.tilemap({key: 'map'});
        const tiles = map.addTilesetImage(
            '0x72-industrial-tileset-32px-extruded',
            'tiles');

        map.createDynamicLayer('Background', tiles);
        this.groundLayer = map.createDynamicLayer('Ground', tiles);
        map.createDynamicLayer('Foreground', tiles);


        // Create a Player at the spawn point
        const spawnPoint = map.findObject(
            'Objects',
            obj => obj.name === 'Spawn Point');
        this.player = new Player(this, spawnPoint.x, spawnPoint.y);
        // Add Player collisions
        this.groundLayer.setCollisionByProperty({collides: true});
        this.physics.world.addCollider(this.player.sprite, this.groundLayer);
        this.physics.world.setBounds(
            0, 0, map.widthInPixels, map.heightInPixels);

        // Set up win box physics stuff
        let winPoint = map.findObject(
            'Objects',
            obj => obj.name === 'Win Point');
        console.log(winPoint);
        this.winGroup = this.physics.add.staticGroup();
        let winObj = this.winGroup.create(
            winPoint.x,
            winPoint.y,
            'spike',
            0,
            false);
        // winObj.setOrigin(0);
        winObj.body.width = 1;
        winObj.body.height = 22;

        // Set up spikes to have proper bounding boxes for collisions
        this.spikeGroup = this.physics.add.staticGroup();
        this.groundLayer.forEachTile(tile => {
            if (tile.index === 77) {
                const spike = this.spikeGroup.create(tile.getCenterX(),
                                                     tile.getCenterY(),
                                                     'spike');
                // Detect spike tiles rotated in Tiles
                spike.rotation = tile.rotation;
                if (spike.angle === 0) spike.body.setSize(32, 6).setOffset(0, 26);
                else if (spike.angle === -90) spike.body.setSize(6, 32).setOffset(26, 0);
                else if (spike.angle === 90) spike.body.setSize(6, 32).setOffset(0, 0);
                else if (spike.angle === 180) spike.body.setSize(32, 6).setOffset(0, 0);

                this.groundLayer.removeTileAt(tile.x, tile.y);
            }
        });


        this.cameras.main.startFollow(this.player.sprite);
        this.cameras.main.setBounds(
            0, 0, map.widthInPixels, map.heightInPixels);

        this.marker = new MouseTileMarker(this, map);

        this.ctrlKey = this.input.keyboard.addKey(
            Phaser.Input.Keyboard.KeyCodes.CTRL);

        // Fixed-position help text
        this.helpText = this.add.text(16, 16, 'WASD to scroll\nLeft-click to' +
            ' draw tiles\nCtrl + left-click to erase\nH to toggle text', {
            font: '18px monospace',
            fill: '#222222',
            padding: {x: 20, y: 10},
            backgroundColor: '#eeeef588'
        }).setScrollFactor(0);
    }

    update(time, delta) {
        if (this.isPlayerDead) return;
        this.marker.update();
        this.player.update();

        this.drawTile();

        if (this.physics.world.overlap(this.player.sprite, this.winGroup)) {
            this.isPlayerDead = true;
            const cam = this.cameras.main;
            cam.fade(1000, 255, 255, 255);

            this.player.freeze();
            this.marker.destroy();

            cam.once('camerafadeoutcomplete', () => {
                this.player.destroy();
                this.scene.restart();
            });
        }
        if (this.player.sprite.y > this.groundLayer.height ||
            this.physics.world.overlap(this.player.sprite, this.spikeGroup)) {

            this.isPlayerDead = true;

            const cam = this.cameras.main;
            cam.shake(250, 0.05);
            cam.fade(333, 25, 0, 0);

            this.player.freeze();
            this.marker.destroy();

            cam.once('camerafadeoutcomplete', () => {
                this.player.destroy();
                this.scene.restart();
            });

        }
    }

    drawTile() {
        // Convert mouse position to world position within the camera
        const worldPoint = this.input.activePointer.positionToCamera(
            this.cameras.main);

        // Draw tiles within the ground layer
        if (this.input.manager.activePointer.isDown) {
            if (this.ctrlKey.isDown) {
                this.groundLayer.removeTileAtWorldXY(
                    worldPoint.x, worldPoint.y);
            } else {
                const tile = this.groundLayer.putTileAtWorldXY(
                    353, worldPoint.x, worldPoint.y);
                tile.setCollision(true);
            }
        }
    }
}