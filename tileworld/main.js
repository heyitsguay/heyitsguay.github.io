const debug = false;

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
    this.load.spritesheet('spritetiles', 'assets/tilesets/tuxemon-sample-32px.png', {frameWidth: 32, frameHeight: 32});
}

function create() {
    createLevel(this);
    createPlayer(this);
    createCamera(this);
    createWASDKeys(this);
    createInteractables(this);
}

function update(time, delta) {
    updatePlayer(this);
    updateSecret(this, time);
    updateInteraction(this);
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
    tileset = map.addTilesetImage('tuxemon-sample-32px-extruded', 'tiles');
    console.log(`##### tileset is ${tileset}`);
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

let helpText, dialogBox, dialogText;
function createCamera(scene) {
    const camera = scene.cameras.main;
    camera.startFollow(player);
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    helpText = scene.add.text(
        16,
        16,
        'WASD to scroll',
        {font: '18px monospace',
         fill: '#ceced1',
         padding: {x: 20, y: 10},
         backgroundColor: '#22222A'}).setScrollFactor(0).setDepth(30);
    
    // Create dialog box UI
    const dialogY = scene.cameras.main.height - 150;
    dialogBox = scene.add.rectangle(
        scene.cameras.main.width / 2,
        dialogY,
        scene.cameras.main.width - 100,
        120,
        0x000000, 0.9
    );
    dialogBox.setStrokeStyle(3, 0xffffff);
    dialogBox.setScrollFactor(0).setDepth(100);
    dialogBox.setVisible(false);
    
    dialogText = scene.add.text(
        scene.cameras.main.width / 2,
        dialogY,
        '',
        {
            font: '16px monospace',
            fill: '#ffffff',
            align: 'center',
            wordWrap: { width: scene.cameras.main.width - 140 }
        }
    );
    dialogText.setOrigin(0.5);
    dialogText.setScrollFactor(0).setDepth(101);
    dialogText.setVisible(false);
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
        action: Phaser.Input.Keyboard.KeyCodes.E,
    });
}


let interactables = [];
let currentInteractable = null;
let interactionCooldown = false;

function createInteractables(scene) {
    // Get all object layers (you might have multiple)
    const objectLayers = map.objects || [];

    objectLayers.forEach(layer => {
        // You can filter by layer name if needed
        if (layer.name !== 'Interactables') return;
        layer.objects.forEach(obj => {

            // Check if object has interactable property
            const isInteractable = obj.properties &&
                obj.properties.find(p => p.name === 'interactable' && p.value === true);

            if (!isInteractable) return;

            let sprite;

            // Handle tile objects differently from shape objects
            if (obj.gid) {
                console.log(`%%% Adding a tile object ${obj.name} with gid ${obj.gid}`);
                // This is a tile object
                // For tile objects, we need to extract the specific frame from the tileset
                const frameIndex = obj.gid - tileset.firstgid;
                console.log(`%%% using frameIndex ${frameIndex} (gid ${obj.gid} - firstgid ${tileset.firstgid}) and (x,y) (${obj.x},${obj.y})   `);
                
                // Create sprite with the tileset texture and specific frame
                sprite = scene.add.sprite(obj.x, obj.y, 'spritetiles', 349);
                
                // Set origin to match Tiled's positioning (bottom-left)
                sprite.setOrigin(0, 1);

                // Apply any transformations
                if (obj.rotation) {
                    sprite.setRotation(obj.rotation);
                }
                if (obj.visible === false) {
                    sprite.setVisible(false);
                } else {
                    sprite.setVisible(true);
                }
                
                // Set sprite size to match the object size
                sprite.setDisplaySize(obj.width, obj.height);

                // Create physics body for interaction detection
                scene.physics.add.existing(sprite, true); // true = static body
                sprite.body.setSize(obj.width, obj.height);

            } else {
                // This is a shape object (rectangle, ellipse, polygon, etc.)
                if (obj.ellipse) {
                    // Ellipse object
                    sprite = scene.add.ellipse(
                        obj.x + obj.width/2,
                        obj.y + obj.height/2,
                        obj.width,
                        obj.height,
                        0xffffff, 0
                    );
                } else if (obj.polygon || obj.polyline) {
                    // Polygon/polyline object
                    const points = obj.polygon || obj.polyline;
                    sprite = scene.add.polygon(
                        obj.x,
                        obj.y,
                        points,
                        0xffffff, 0
                    );
                } else {
                    // Rectangle object (default)
                    sprite = scene.add.rectangle(
                        obj.x + obj.width/2,
                        obj.y - obj.height/2,
                        obj.width,
                        obj.height,
                        0xffffff, 0
                    );
                }

                // Add physics body for non-tile objects
                scene.physics.add.existing(sprite, true);
            }

            // Store all the Tiled properties on the sprite
            sprite.setData('properties', obj.properties);
            sprite.setData('id', obj.id);
            sprite.setData('name', obj.name);
            sprite.setData('type', obj.type);
            sprite.setData('tiledObject', obj); // Store the full object for reference

            // Set depth between world layer (0) and above player layer (10)
            // sprite.setDepth(5);

            console.log(`Created sprite named ${obj.name} at (${sprite.x}, ${sprite.y}) with size (${sprite.width}, ${sprite.height})`);
            console.log(`Sprite visible: ${sprite.visible}, frame: ${sprite.frame.name}`);

            // Add to interactables array
            interactables.push(sprite);
            
            // Check if object has collision property
            const hasCollision = true;// && obj.properties &&
                //obj.properties.find(p => p.name === 'collides' && p.value === true);
            
            if (hasCollision) {
                // Make the physics body immovable so player can't push it
                // sprite.body.setImmovable(true);
                // Add collision between player and this object
                scene.physics.add.collider(player, sprite);
                console.log(`Added collision for ${obj.name}`);
            }

            // Optional: Add visual feedback for debugging
            if (debug) {
                // Add a semi-transparent overlay to show interaction area
                const debugRect = scene.add.rectangle(
                    obj.x + obj.width/2,
                    obj.y - obj.height/2,
                    obj.width,
                    obj.height,
                    hasCollision ? 0xff0000 : 0x00ff00, 0.3
                );
                debugRect.setStrokeStyle(2, hasCollision ? 0xff0000 : 0x00ff00);
            }
        });
    });

    console.log(`Created ${interactables.length} interactable objects`);
}

// Helper function to get a property value from an object
function getObjectProperty(sprite, propertyName) {
    const properties = sprite.getData('properties');
    if (!properties) return null;

    const prop = properties.find(p => p.name === propertyName);
    return prop ? prop.value : null;
}

// Updated interaction detection to work better with tile objects
function updateInteraction(scene) {
    let nearestInteractable = null;
    let nearestDistance = Infinity;

    interactables.forEach(sprite => {
        // Get the actual bounds of the sprite for accurate distance calculation
        const bounds = sprite.getBounds();

        // Calculate distance from player center to object center
        const distance = Phaser.Math.Distance.Between(
            player.x, player.y,
            bounds.centerX, bounds.centerY
        );

        const interactionRange = 60;
        if (distance < interactionRange && distance < nearestDistance) {
            const angle = Phaser.Math.Angle.Between(
                player.x, player.y,
                bounds.centerX, bounds.centerY
            );
            const playerFacing = getPlayerFacing();

            if (isAngleInDirection(angle, playerFacing)) {
                nearestDistance = distance;
                nearestInteractable = sprite;
            }
        }
    });

    // Update visual feedback
    if (currentInteractable !== nearestInteractable) {
        if (currentInteractable) {
            // Remove highlight from previous interactable
            currentInteractable.clearTint();
            if (currentInteractable.setStrokeStyle) {
                currentInteractable.setStrokeStyle(0);
            }
        }
        currentInteractable = nearestInteractable;
        if (currentInteractable) {
            // Add highlight to current interactable
            // For tile objects, use tint
            if (currentInteractable.setTint) {
                currentInteractable.setTint(0xaaaaaa);
            }
            // For shape objects, use stroke
            if (currentInteractable.setStrokeStyle) {
                currentInteractable.setStrokeStyle(3, 0xffff00);
            }
        }
    }

    // Handle interaction (rest of the function remains the same)
    if ((cursors.action.isDown || cursors.space.isDown) && !interactionCooldown) {
        interactionCooldown = true;

        if (dialogBox.visible) {
            hideDialog();
        } else if (currentInteractable) {
            handleInteraction(scene, currentInteractable);
        }

        scene.time.delayedCall(300, () => {
            interactionCooldown = false;
        });
    }
}


/****************************************
 * Functions used in the update() scene *
 ****************************************/

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
//
// function updateInteraction(scene) {
//     // Find nearest interactable
//     let nearestInteractable = null;
//     let nearestDistance = Infinity;
//
//     interactables.forEach(obj => {
//         const distance = Phaser.Math.Distance.Between(
//             player.x, player.y,
//             obj.x, obj.y
//         );
//
//         const interactionRange = 60; // Roughly 2 tiles
//         if (distance < interactionRange && distance < nearestDistance) {
//             // Check if player is facing the object
//             const angle = Phaser.Math.Angle.Between(player.x, player.y, obj.x, obj.y);
//             const playerFacing = getPlayerFacing();
//
//             if (isAngleInDirection(angle, playerFacing)) {
//                 nearestDistance = distance;
//                 nearestInteractable = obj;
//             }
//         }
//     });
//
//     // Update visual feedback
//     if (currentInteractable !== nearestInteractable) {
//         if (currentInteractable) {
//             currentInteractable.setStrokeStyle(0);
//         }
//         currentInteractable = nearestInteractable;
//         if (currentInteractable) {
//             currentInteractable.setStrokeStyle(3, 0xffff00);
//         }
//     }
//
//     // Handle interaction
//     if ((cursors.action.isDown || cursors.space.isDown) && !interactionCooldown) {
//         interactionCooldown = true;
//
//         // If dialog is open, close it
//         if (dialogBox.visible) {
//             hideDialog();
//         }
//         // Otherwise, interact with object if available
//         else if (currentInteractable) {
//             handleInteraction(scene, currentInteractable);
//         }
//
//         // Reset cooldown after 300ms
//         scene.time.delayedCall(300, () => {
//             interactionCooldown = false;
//         });
//     }
// }

function getPlayerFacing() {
    // Determine player facing based on current texture or last velocity
    if (player.texture.key === 'atlas') {
        const frame = player.frame.name;
        if (frame.includes('left')) return 'left';
        if (frame.includes('right')) return 'right';
        if (frame.includes('back')) return 'up';
        if (frame.includes('front')) return 'down';
    }
    return 'down'; // default
}

function isAngleInDirection(angle, direction) {
    // Normalize angle to 0-2π
    angle = Phaser.Math.Wrap(angle, -Math.PI, Math.PI);
    
    const tolerance = Math.PI / 3; // 60 degrees
    switch(direction) {
        case 'right': return Math.abs(angle) < tolerance;
        case 'down': return Math.abs(angle - Math.PI/2) < tolerance;
        case 'left': return Math.abs(Math.abs(angle) - Math.PI) < tolerance;
        case 'up': return Math.abs(angle + Math.PI/2) < tolerance;
    }
    return false;
}

function handleInteraction(scene, interactable) {
    const properties = interactable.getData('properties');
    if (!properties) return;
    
    // Get property values
    const getProperty = (name) => {
        const prop = properties.find(p => p.name === name);
        return prop ? prop.value : null;
    };
    
    // Handle examine interaction
    const examineText = getProperty('examineText');
    if (examineText) {
        showDialog(examineText);
        return;
    }
    
    // Handle state change interaction (e.g., doors)
    const currentState = getProperty('state');
    const alternateState = getProperty('alternateState');
    if (currentState && alternateState) {
        // For now, just show what would happen
        showDialog(`The ${interactable.getData('name') || 'object'} is ${currentState}. (Would change to ${alternateState})`);
        // TODO: Actually change the state and update collision/sprite
        return;
    }
    
    // Handle pickup interaction
    const pickupItem = getProperty('pickupItem');
    if (pickupItem) {
        const value = getProperty('value') || 1;
        showDialog(`Picked up ${pickupItem}! (+${value})`);
        // Remove the interactable
        const index = interactables.indexOf(interactable);
        if (index > -1) {
            interactables.splice(index, 1);
        }
        interactable.destroy();
        currentInteractable = null;
        // TODO: Add to player inventory
        return;
    }
    
    // Default interaction
    showDialog(`You interact with the ${interactable.getData('name') || 'object'}.`);
}

function showDialog(text, duration = 0) {
    dialogText.setText(text);
    dialogBox.setVisible(true);
    dialogText.setVisible(true);
    
    if (duration > 0) {
        game.scene.scenes[0].time.delayedCall(duration, hideDialog);
    }
}

function hideDialog() {
    dialogBox.setVisible(false);
    dialogText.setVisible(false);
}