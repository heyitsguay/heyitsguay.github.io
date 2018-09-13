let config, game;
$(document).ready(function() {
    const width = 1200;
    const height = 600;
    config = {
        type: Phaser.AUTO,
        width: width,
        height: height,
        backgroundColor: '#22222A',
        parent: 'game-container',
        pixelArt: true,
        scene: {
            preload: preload,
            create: create,
            update: update
        }
    };
    game = new Phaser.Game(config);
});

function preload() {
    this.load.image(
        'tiles',
        'assets/tilesets/0x72-industrial-tileset-32px-extruded.png');
    this.load.tilemapTiledJSON('map', 'assets/tilemaps/platformer.json');

}

function create() {
    createLevel(this);
    createControls(this);
}

function update(time, delta) {
    controls.update(delta);
    drawTile(this);
}

/****************************************
 * Functions used in the create() scene *
 ****************************************/

let map, tiles, groundLayer;
function createLevel(scene) {
    map = scene.make.tilemap({key: 'map'});
    tiles = map.addTilesetImage('0x72-industrial-tileset-32px-extruded',
                                'tiles');
    map.createDynamicLayer('Background', tiles);
    groundLayer = map.createDynamicLayer('Ground', tiles);
    map.createDynamicLayer('Foreground', tiles);
}

let controls, cursors, shiftKey, marker;
function createControls(scene) {
    shiftKey = scene.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SHIFT);

    cursors = scene.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE
    });

    const controlConfig = {
        camera: scene.cameras.main,
        left: cursors.left,
        right: cursors.right,
        up: cursors.up,
        down: cursors.down,
        speed: 0.5
    };
    controls = new Phaser.Cameras.Controls.FixedKeyControl(controlConfig);

    scene.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // Create a graphic highlighting the tile under the mouse
    marker = scene.add.graphics();
    marker.lineStyle(5, 0xffffff, 1);
    marker.strokeRect(0, 0, map.tileWidth, map.tileHeight);
    marker.lineStyle(3, 0xff4f78, 1);
    marker.strokeRect(0, 0, map.tileWidth, map.tileHeight);

    // Fixed-position help text
    scene.add.text(16, 16, 'WASD to scroll\nLeft-click to draw tiles\nShift' +
        ' + left-click to erase', {
        font: '18px monospace',
        fill: '#222222',
        padding: {x: 20, y: 10},
        backgroundColor: '#eeeef5'
    }).setScrollFactor(0);
}

/****************************************
 * Functions used in the update() scene *
 ****************************************/

function drawTile(scene) {
    // Convert mouse position to world position within the camera
    const worldPoint = scene.input.activePointer.positionToCamera(
        scene.cameras.main);

    // Snap the marker position to the tile grid by converting world -> tile
    // -> world
    const pointerTileXY = groundLayer.worldToTileXY(worldPoint.x, worldPoint.y);
    const snappedWorldPoint = groundLayer.tileToWorldXY(pointerTileXY.x,
                                                        pointerTileXY.y);
    marker.setPosition(snappedWorldPoint.x, snappedWorldPoint.y);

    // Draw tiles within the ground layer
    if (scene.input.manager.activePointer.isDown) {
        if (shiftKey.isDown) {
            groundLayer.removeTileAtWorldXY(worldPoint.x, worldPoint.y);
        } else {
            groundLayer.putTileAtWorldXY(353, worldPoint.x, worldPoint.y);
        }
    }
}