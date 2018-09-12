const debug = false;

let config, game;
$(document).ready(function() {
    const width = Math.min(1024, window.innerWidth);
    const height = Math.min(1024, window.innerHeight);
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
                gravity: {y: 0}
            }
        }
    };
    game = new Phaser.Game(config);
});

function preload() {
    this.load.image('tiles', 'assets/tilesets/tuxemon-sample-32px-extruded.png');
    this.load.tilemapTiledJSON('map', 'assets/tilemaps/tuxemon-town.json');
    this.load.atlas('atlas',
                    'assets/atlas/atlas_eli2.png',
                    'assets/atlas/atlas_eli.json');
}

function create() {
    createLevel(this);
    createPlayer(this);
    createCamera(this);
    createWASDKeys(this);
}

function update(time, delta) {
    updatePlayer(this);
}

/****************************************
 * Functions used in the create() scene *
 ****************************************/

let player, anims;
function createPlayer(scene) {
    const spawnPoint = map.findObject(
        'Objects',
        obj => obj.name === 'Spawn Point');
    player = scene.physics.add
        .sprite(spawnPoint.x, spawnPoint.y, 'atlas', 'eli-front')
        .setSize(30, 40)
        .setOffset(0, 24);

    scene.physics.add.collider(player, worldLayer);
    player.setCollideWorldBounds(true);

    createPlayerAnims(scene);
}

function createPlayerAnims(scene) {
    anims = scene.anims;
    anims.create({
        key: 'eli-left-walk',
        frames: anims.generateFrameNames('atlas', {
            prefix: 'eli-left-walk.',
            start: 0,
            end: 3,
            zeroPad: 3}),
        frameRate: 10,
        repeat: -1
    });
    anims.create({
        key: 'eli-right-walk',
        frames: anims.generateFrameNames('atlas', {
            prefix: 'eli-right-walk.',
            start: 0,
            end: 3,
            zeroPad: 3}),
        frameRate: 10,
        repeat: -1
    });
    anims.create({
        key: 'eli-front-walk',
        frames: anims.generateFrameNames('atlas', {
            prefix: 'eli-front-walk.',
            start: 0,
            end: 3,
            zeroPad: 3}),
        frameRate: 10,
        repeat: -1
    });
    anims.create({
        key: 'eli-back-walk',
        frames: anims.generateFrameNames('atlas', {
            prefix: 'eli-back-walk.',
            start: 0,
            end: 3,
            zeroPad: 3}),
        frameRate: 10,
        repeat: -1
    });
}

let map, tileset, belowLayer, worldLayer, aboveLayer;
function createLevel(scene) {
    map = scene.make.tilemap({key: 'map'});
    // Add Tiled tileset to the map
    tileset = map.addTilesetImage('tuxmon-sample-32px-extruded', 'tiles');
    // Add Tiled layers to the map
    belowLayer = map.createStaticLayer('Below Player', tileset, 0, 0);
    worldLayer = map.createStaticLayer('World', tileset, 0, 0);
    worldLayer.setCollisionByProperty({collides: true});
    if (debug) {
        const debugGraphics = scene.add.graphics().setAlpha(0.66);
        worldLayer.renderDebug(debugGraphics, {
            tileColor: null,
            collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255),
            faceColor: new Phaser.Display.Color(48, 26, 9, 255)
        });
    }
    aboveLayer = map.createStaticLayer('Above Player', tileset, 0, 0);
    aboveLayer.setDepth(10);

    scene.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
}

function createCamera(scene) {
    const camera = scene.cameras.main;
    camera.startFollow(player);
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    scene.add.text(
        16,
        16,
        'WASD to scroll',
        {font: '18px monospace',
         fill: '#ceced1',
         padding: {x: 20, y: 10},
         backgroundColor: '#22222A'}).setScrollFactor(0).setDepth(30);
}

let cursors;
function createWASDKeys(scene) {
    cursors = scene.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        shift: Phaser.Input.Keyboard.KeyCodes.SHIFT
    });
}

/****************************************
 * Functions used in the update() scene *
 ****************************************/

function updatePlayer(scene) {
    updatePlayerVelocity();
    updatePlayerAnimation();

}

let prevVelocity;
const playerSpeed = 150;
function updatePlayerVelocity() {
    // Record previous frame's player velocity, for later animation purposes
    prevVelocity = player.body.velocity.clone();
    // Stop previous movement
    player.body.setVelocity(0);
    // Horizontal movement
    if (cursors.left.isDown) {
        player.body.setVelocityX(-playerSpeed);
    } else if (cursors.right.isDown) {
        player.body.setVelocityX(playerSpeed);
    }
    // Vertical movement
    if (cursors.up.isDown) {
        player.body.setVelocityY(-playerSpeed);
    } else if (cursors.down.isDown) {
        player.body.setVelocityY(playerSpeed);
    }
    // Normalize velocity
    player.body.velocity.normalize().scale(playerSpeed);

}

function updatePlayerAnimation() {
    if (cursors.left.isDown) {
        player.anims.play('eli-left-walk', true);
    } else if (cursors.right.isDown) {
    player.anims.play('eli-right-walk', true);
    } else if (cursors.up.isDown) {
        player.anims.play('eli-back-walk', true);
    } else if (cursors.down.isDown) {
        player.anims.play('eli-front-walk', true);
    } else {
        player.anims.stop();
        // Pick an idle frame if motion is stopped
        if (prevVelocity.x < 0) player.setTexture('atlas', 'eli-left');
        else if (prevVelocity.x > 0) player.setTexture('atlas', 'eli-right');
        else if (prevVelocity.y < 0) player.setTexture('atlas', 'eli-back');
        else if (prevVelocity.y > 0) player.setTexture('atlas', 'eli-front');
    }

}