let config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: {y: 300},
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

let game = new Phaser.Game(config);
let platform;

function preload() {
    this.load.image('sky', 'assets/sky.png');
    platform = this.load.image('ground', 'assets/platform.png');
    this.load.image('star', 'assets/star.png');
    this.load.image('coin', 'assets/coin.png');
    this.load.image('bomb', 'assets/bomb.png');
    this.load.spritesheet('dude',
                          'assets/dude.png',
                          {frameWidth: 32, frameHeight: 48 });
}

let w, h;
let cursors;

function create() {
    w = window.innerWidth;
    h = window.innerHeight;
    cursors = createWASDKeys(this);
    buildSky(this);
    buildPlatforms(this);
    buildPlayer(this);
    buildCoins(this);
    buildScore(this);
    buildBombs(this);
}

function update() {
    if (!gameOver) {
        updatePlayer();
    }
}

/************************************************
 * Functions called within the body of create() *
 ************************************************/

function createWASDKeys(that) {
    return that.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        shift: Phaser.Input.Keyboard.KeyCodes.SHIFT
    });
}

function buildSky(that) {
    let img = that.add.image(w/2, h/2, 'sky');
    img.setScaleMode(Phaser.ScaleModes.NEAREST);
    img.setScale(w/800, h/600);
    let n_stars = 100;
    for (let n = 0; n < n_stars; ++n) {
        let sx = (n / (n_stars - 1) + 0.05 * Math.random() - 0.025) * w;
        let sy = 0.5 * h * Math.random();
        let star = that.add.image(sx, sy, 'star');
        let scale = 0.3 * Math.random();
        star.setScale(scale);
        star.setTint(hsv_to_rgb(Math.random(), 0.3 * Math.random(), 0.1  + 0.9 * Math.random()));
        let alpha = Math.min(1, 1.3 * (1 - sy / (0.5 * h)));
        star.setAlpha(alpha);
        star.setRotation(2 * Math.PI * Math.random());
    }
}

function hsv_to_rgb(h, s, v) {
    let r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    r = Math.floor(r * 256);
    g = Math.floor(g * 256);
    b = Math.floor(b * 256);
    return 256 * 256 * r + 256 * g + b;
}

let platforms;

function buildPlatforms(that) {
    let pw = 400;
    let ph = 32;
    platforms = that.physics.add.staticGroup();
    platforms.create(w/2, h - ph/2, 'ground').setScale(w / pw, 1).refreshBody();
    platforms.create(w - 1.5 * pw, 0.75 * h, 'ground').setScale(3, 1).refreshBody();
    platforms.create(w / 16, 0.4 * h, 'ground').setScale(0.3 * w / pw, 1).refreshBody();
    platforms.create(15 * w / 16, 0.4 * h, 'ground').setScale(0.3 * w / pw, 1).refreshBody();
}

let player;

function buildPlayer(that) {
    player = that.physics.add.sprite(100, h - 100, 'dude');
    player.setBounce(0.2);
    player.setCollideWorldBounds(true);

    that.anims.create({
        key: 'left',
        frames: that.anims.generateFrameNumbers('dude', {start: 0, end: 3}),
        frameRate: 10,
        repeat: -1
    });

    that.anims.create({
        key: 'turn',
        frames: [{key: 'dude', frame: 4}],
        frameRate: 20
    });

    that.anims.create({
        key: 'right',
        frames: that.anims.generateFrameNumbers('dude', {start: 5, end: 8}),
        frameRate: 10,
        repeat: -1
    });

    that.physics.add.collider(player, platforms);
}

let coins;

function buildCoins(that) {
    coins = that.physics.add.group({
        key: 'coin',
        repeat: 11,
        setXY: {x: 12, y: 0, stepX: w / 12}
    });

    coins.children.iterate(function(child) {
        child.setBounceY(Phaser.Math.FloatBetween(0.4, 0.95));
    });

    that.physics.add.collider(coins, platforms);
    that.physics.add.overlap(player, coins, collectCoin, null, that);
}

let nRounds = 0;
function collectCoin(player, coin) {
    coin.disableBody(true, true);

    score += 10;
    scoreText.setText('Score: ' + score);

    if (coins.countActive(true) === 0) {
        coins.children.iterate(function(child) {
            child.enableBody(true, child.x, 0, true, true);
        });

        nRounds += 1;
        
        for (let n = 0; n < nRounds; ++n) {
	    	addBomb();    
    	}
    }
}

function addBomb() {
	let x = Phaser.Math.Between(0, w);
    let bomb = bombs.create(x, 0, 'bomb');
    bomb.setBounce(1);
    bomb.setCollideWorldBounds(true);
    bomb.setVelocity(nRounds * Phaser.Math.Between(-30, 30), nRounds * Phaser.Math.Between(5, 15));
    bomb.allowGravity = false;
}

let score = 0;
let scoreText;

function buildScore(that) {
    scoreText = that.add.text(16, 16, 'Score: 0', {fontSize: '32px', fill: '#eee'});
}

let bombs;
let gameOver = false;

function buildBombs(that) {
    bombs = that.physics.add.group();
    that.physics.add.collider(bombs, platforms);
    that.physics.add.collider(player, bombs, hitBomb, null, that);
}

function hitBomb(player, bomb) {
    this.physics.pause();
    player.setTint(0xff0000);
    player.anims.play('turn');
    scoreText.setText('Score: ' + score + '  GAME OVER');
    gameOver = true;
}

/************************************************
 * Functions called within the body of update() *
 ************************************************/


function updatePlayer() {
    if (cursors.left.isDown) {
        player.setVelocityX(-160);
        player.anims.play('left', true);
    }
    else if (cursors.right.isDown) {
        player.setVelocityX(160);
        player.anims.play('right', true);
    }
    else {
        let friction = 0.5 + 0.49 * (player.body.touching.down? 0 : 1);
        player.setVelocityX(friction * player.body.velocity.x);
        player.anims.play('turn');
    }

    if (cursors.up.isDown && player.body.touching.down) {
        player.setVelocityY(-500);
    }
}

