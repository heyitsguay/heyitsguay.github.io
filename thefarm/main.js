const debug = false;
const tileWidth = 100;
const tileHeight = 100;
const tileSize = 32;

const T_DIRT = 174;
const T_STONE = 129;
const T_GRASS = 126;
const T_VOID = 335;
const T_REDFLOWER1 = 236;
const T_REDFLOWER2 = 260;
const T_REDFLOWER3 = 284;
const T_BLUEFLOWER1 = 237;
const T_BLUEFLOWER2 = 261;
const T_BLUEFLOWER3 = 285;
const T_YELLOWFLOWER1 = 238;
const T_YELLOWFLOWER2 = 262;
const T_YELLOWFLOWER3 = 286;

let activeTile = T_STONE


let width, height;
let config, game;

let time;

// // Maintain a list of tiles with active ongoing state transitions, and process a certain number of them per tick
// let activeTiles = {};
// let nTilesProcessedPerTick = 1000;
// // TODO: Keep going. A 2D hashmap with an associated ordered list of (x, y) tile ids to update.

// Float32 array of some tile property. This first one is "growth", a deliberately vague abstract thing we'll use to 
const propertyBytes = 4
let propertyArray_growth = new ArrayBuffer(tileWidth * tileHeight * propertyBytes)

let activeTiles = [];
let activeIndex = 0;
let nTilesProcessedPerTick = 1000;
function updateActiveTiles() {
    let newActiveTiles = [];
    let nActiveTiles = activeTiles.length;
    let nTilesToProcess = Math.min(nActiveTiles, nTilesProcessedPerTick);
    if (nActiveTiles > 0) {
        for (let i = activeIndex; i < activeIndex + nTilesToProcess; i++) {
            let imod = i % nActiveTiles;
            let tileInfo = activeTiles[imod];
            let tileInfosOut = tileInfo.update(tileInfo.tile);
            for (let infoOut of tileInfosOut) {
                newActiveTiles.push(infoOut);
            }
        }
    }
    activeTiles = newActiveTiles;
}

let transitions = [];
function pushTransition(transition) {
    if (transitions.length === 0) transitions.push(transition);
    else {
        const index = sortedIndex(transitions, transition, t => t.updateTime);
        transitions.splice(index, 0, transition);
    }
}
function sortedIndex(array, item, comparer) {
    let low = 0;
    let high = array.length;

    const value = comparer(item);

    while (low < high) {
        let mid = (low + high) >>> 1;
        if (comparer(array[mid]) < value) low = mid + 1;
        else high = mid;
    }
    return low;
}


window.onload = () => {
    width = Math.min(tileWidth * tileSize, window.innerWidth);
    height = Math.min(tileHeight * tileSize, window.innerHeight);
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
}

function preload() {
    // this.load.image('tiles', 'assets/tilesets/tuxemon-sample-32px.png');
    this.load.image('tiles', 'assets/tilesets/tuxemon-void-extruded.png');
    // this.load.image('tiles', 'assets/tilesets/tuxemon-sample-32px-extruded.png');
    // this.load.tilemapTiledJSON('map', 'assets/tilemaps/tuxemon-town.json');
    this.load.tilemapTiledJSON('map', 'assets/tilemaps/void.json');
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
    updateWorld(this, time);
    updatePlayer(this);
    updateSecret(this, time);
    updateTransitions(this, time);
}

/****************************************
 * Functions used in the create() scene *
 ****************************************/

let player, anims;
const playerRadius = 2 * tileSize;
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
    // tileset = map.addTilesetImage('tuxmon-sample-32px-extruded', 'tiles');
    tileset = map.addTilesetImage('void', 'tiles', 32, 32, 1, 2);
    // tileset = map.addTilesetImage('tuxemon', 'tiles');
    // Add Tiled layers to the map
    belowLayer = map.createDynamicLayer('Below Player', tileset, 0, 0);
    worldLayer = map.createDynamicLayer('World', tileset, 0, 0);
    worldLayer.setCollisionByProperty({collides: true});
    aboveLayer = map.createDynamicLayer('Above Player', tileset, 0, 0);
    // worldLayer.setDepth(10);
    if (debug) {
        const debugGraphics = scene.add.graphics().setAlpha(0.66);
        worldLayer.renderDebug(debugGraphics, {
            tileColor: null,
            collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255),
            faceColor: new Phaser.Display.Color(48, 26, 9, 255)
        });
    }
    // aboveLayer = map.createStaticLayer('Above Player', tileset, 0, 0);
    // aboveLayer.setDepth(10);

    scene.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
}

function createCamera(scene) {
    const camera = scene.cameras.main;
    camera.startFollow(player);
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    let helpText = scene.add.text(
        160,
        16,
        'WASD to scroll',
        {font: '18px monospace',
         fill: '#ceced1',
         padding: {x: 20, y: 10},
         backgroundColor: '#22222A88'}).setScrollFactor(0).setDepth(30);
    scene.tweens.add({
        targets: helpText,
        alpha: 0,
        ease: 'Linear',
        duration: 1200,
        delay: 2000});
}

let cursors;
function createWASDKeys(scene) {
    cursors = scene.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
        secret: Phaser.Input.Keyboard.KeyCodes.O,
        use: Phaser.Input.Keyboard.KeyCodes.E,
        next_tile: Phaser.Input.Keyboard.KeyCodes.P
    });
}

/****************************************
 * Functions used in the update() scene *
 ****************************************/
function updateTransitions(scene, time) {
    if (transitions.length > 0) {
        const nextUpdateTime = transitions[0].updateTime;
        if (time >= nextUpdateTime) {
            const transition = transitions.shift();
            const newTransition = applyTransition(transition, time);
            if (!(newTransition === null)) {
                pushTransition(newTransition);
            }
        }
    }
}
function applyTransition(transition, time) {
    const layer = transition.layer;
    const location = transition.location;
    let chain = transition.chain;
    const delta = transition.delta.slice(1, transition.delta.length);
    const newId = chain.shift();
    layer.putTileAtWorldXY(newId, location.x, location.y);
    if (chain.length === 0) {
        return null
    } else {
        return {'chain': chain, 'delta': delta, updateTime: time + delta[0], 'location': location, 'layer': layer};
    }
}

let pointerPressed = false;
let nextTilePressed = false;
function updateWorld(scene, time) {
    const pointer = scene.input.activePointer;
    const worldPoint = pointer.positionToCamera(scene.cameras.main);
    const worldX = Math.floor(worldPoint.x);
    const worldY = Math.floor(worldPoint.y);

    if (cursors.next_tile.isDown) {
        if (!nextTilePressed) {
            if (activeTile == T_STONE) {
                activeTile == T_DIRT;
            } else {
                activeTile == T_STONE;
            }
        }
        nextTilePressed = true;
    } else {
        nextTilePressed = false;
    }


    if (cursors.use.isDown) {
        if (playerDistanceCheck(worldX, worldY)) {
            createRock(worldX, worldY);
            // waterGround(worldX, worldY);
        }
    }

    if (pointer.isDown) {
        if (playerDistanceCheck(worldX, worldY)) {
            placeFlower(worldX, worldY, time);
            pointerPressed = true;
        }

    } else {
        pointerPressed = false;
    }
}
function createRock(x, y) {
    const tile = belowLayer.getTileAtWorldXY(x, y, true);
    const tileId = tile === null ? -1 : tile.index;
    console.log('making rock. found id ', tileId);
    if (tileId === 335) {
        console.log('found a void!');
        belowLayer.putTileAtWorldXY(activeTile, x, y);
    } 
}
function waterGround(x, y) {
    const belowTile = belowLayer.getTileAtWorldXY(x, y, true);
    const belowId = belowTile === null ? -1 : belowTile.index;
    if (belowId === 174) {
        belowLayer.putTileAtWorldXY(182, x, y);
    }
}
function placeFlower(x, y, time) {
    // const flowerIds = [16, 40, 64, 88, 112, 136, 160, 184, 208];
    const flowerTransitions = [
        {'chain': [236, 260, 284, -1], 'delta': [0, 5000, 10000, 20000], 'updateTime': null, 'location': null, 'layer': null},
        {'chain': [237, 261, 285, -1], 'delta': [0, 10000, 20000, 180000], 'updateTime': null, 'location': null, 'layer': null},
        {'chain': [238, 262, 286, -1], 'delta': [0, 2500, 5000, 10000], 'updateTime': null, 'location': null, 'layer': null}
    ];

    const belowTile = belowLayer.getTileAtWorldXY(x, y, true);
    const belowId = belowTile === null ? -1 : belowTile.index;

    const worldTile = worldLayer.getTileAtWorldXY(x, y, true);
    const worldId = worldTile === null ? -1 : worldTile.index;

    if (worldId === -1 && belowId === 174) {
        let flowerTransition = randomElement(flowerTransitions);
        flowerTransition.updateTime = time + flowerTransition['delta'][0];
        flowerTransition.location = new Phaser.Math.Vector2(x, y);
        flowerTransition.layer = worldLayer;
        pushTransition(flowerTransition);
    }
}
function playerDistanceCheck(x, y) {
    const playerCenter = player.getCenter();
    return (x - playerCenter.x) ** 2 + (y - playerCenter.y) ** 2 < playerRadius ** 2;
}
function logIds(x, y) {
    const belowTile = belowLayer.getTileAtWorldXY(x, y, true);
    const belowId = belowTile === null ? -1 : belowTile.index;

    const worldTile = worldLayer.getTileAtWorldXY(x, y, true);
    const worldId = worldTile === null ? -1 : worldTile.index;

    if (!(belowTile === null)) {
        console.log(`Below ID: ${belowId}`);
    } else {
        console.log(`Below Tile: ${belowTile}`);
    }

    if (!(worldTile === null)) {
        console.log(`World ID: ${worldId}`);
    } else {
        console.log(`World Tile: ${worldTile}`);
    }
}

let secretTriggered = false;
let triggerTime = 2500;
let lastTriggerTime = 0;
let triggerPause = 4000;
function updateSecret(scene, time) {

    if (secretTriggered && time - lastTriggerTime > triggerPause) {
        secretTriggered = false;
    }

    if (cursors.secret.isDown) {
        if (!secretTriggered && time - cursors.secret.timeDown > triggerTime) {
            secretTriggered = true;
            lastTriggerTime = time;
            playSecret(scene);
        }
    }
}

let secretTween = null;
function playSecret(scene) {
    const textX = player.body.x - 22;
    const playerY = player.body.y;
    const textY = playerY < 60 ? playerY + 30 : playerY - 30;
    let secretText = scene.add.text(
        textX,
        textY,
        'Hey Eli ❤️',
        {font: '14px monospace',
         fill: '#f27171',
         padding: {x: 6, y: 4},
         backgroundColor: '#e8e8e8'}).setDepth(30);
    if (secretTween) {
        secretTween.stop();
    }
    secretTween = scene.tweens.add({
        targets: secretText,
        alpha: 0,
        ease: 'Linear',
        duration: 2500,
        delay: 1000});
}

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

function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}