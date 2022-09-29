function mod1(x) {
    if (x < 0) {
        return x % 1.0 + 1;
    } else {
        return x % 1.0;
    }
}

function sign(x) {
    // Returns -1 if x < 0, 0 if x == 0, or 1 if x > 0
    if (x < 0) {
        return -1;
    } else if (x === 0) {
        return 0;
    } else {
        return 1;
    }
}

function sign2(x) {
    // Returns -1 if x < 0, +1 if x >= 0
    return x < 0 ? -1 : 1;
}

function getTileIdx(tile) {
    return tile.yt * tilesX + tile.xt;
}

function sigmoid(x) {
    return 1 / (1 + exp(4.8 - 8 * x));
}

function heartbeat(t_, strength, timeScale) {
    let bpm = 20 + strength * strength * 120;
    let beat2Strength = 0.65 + 0.35 * strength * strength;
    const beat1T = 0.15;
    const beat2T = 0.25;
    const beat1Bandwidth = 0.0015;
    const beat2Bandwidth = 0.0045;

    timeScale = timeScale * bpm / 60;

    let T = (timeScale * t_) % 1;

    return pow(strength, 1.25) * (exp(-pow(T-beat1T, 2) / beat1Bandwidth) + beat2Strength * exp(-pow(T-beat2T, 2) / beat2Bandwidth));
}