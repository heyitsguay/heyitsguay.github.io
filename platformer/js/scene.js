import Player from './player.js';

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
            'tiles',
            'assets/tilesets/0x72-industrial-tileset-32px-extruded.png');
        this.load.tilemapTiledJSON(
            'map',
            'assets/tilemaps/platformer-simple.json');
    }

    create() {
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

        this.cameras.main.startFollow(this.player.sprite);
        this.cameras.main.setBounds(
            0, 0, map.widthInPixels, map.heightInPixels);

        // Create a graphic highlighting the tile under the mouse
        this.marker = this.add.graphics();
        this.marker.lineStyle(5, 0xffffff, 1);
        this.marker.strokeRect(0, 0, map.tileWidth, map.tileHeight);
        this.marker.lineStyle(3, 0xff4f78, 1);
        this.marker.strokeRect(0, 0, map.tileWidth, map.tileHeight);

        this.ctrlKey = this.input.keyboard.addKey(
            Phaser.Input.Keyboard.KeyCodes.CTRL);

        // Fixed-position help text
        this.add.text(16, 16, 'WASD to scroll\nLeft-click to draw' +
            ' tiles\nShift + left-click to erase', {
            font: '18px monospace',
            fill: '#222222',
            padding: {x: 20, y: 10},
            backgroundColor: '#eeeef5'
        }).setScrollFactor(0);
    }

    update(time, delta) {
        this.drawTile();

        this.player.update();

        if (this.player.sprite.y > this.groundLayer.height) {
            this.player.destroy();
            this.scene.restart();
        }
    }

    drawTile() {
        // Convert mouse position to world position within the camera
        const worldPoint = this.input.activePointer.positionToCamera(
            this.cameras.main);
        // Snap the marker position to the tile grid by converting world -> tile
        // -> world
        const pointerTileXY = this.groundLayer.worldToTileXY(
            worldPoint.x, worldPoint.y);
        const snappedWorldPoint = this.groundLayer.tileToWorldXY(
            pointerTileXY.x, pointerTileXY.y);
        this.marker.setPosition(snappedWorldPoint.x, snappedWorldPoint.y);

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