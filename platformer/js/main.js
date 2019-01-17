import PlatformerScene from './scene.js';

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
        scene: PlatformerScene,
        physics: {
            default: 'arcade',
            arcade: {
                gravity: {y: 1000}
            }
        }
    };
    game = new Phaser.Game(config);
});
