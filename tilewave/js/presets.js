/*
 * Load a preset
 */
function loadPreset(val) {
    val = parseInt(val);
    var preset = presets[val];
    sliderDrawMode(preset.drawMode);
    sliderShadowMode(preset.shadowMode);
    sliderTimeSpeed(preset.timeSpeed);
    sliderTileSize(preset.tileSize);
    sliderFrequency(preset.frequency);
    sliderShadowHue(preset.shadowHue);
}

var presets = {

    0: {
        'drawMode': 0,
        'shadowMode': 0,
        'timeSpeed': 1.00,
        'tileSize': 1.6021,
        'frequency': 3.70,
        'shadowHue': 0.25
    },

    1: {
        'drawMode': 0,
        'shadowMode': 0,
        'timeSpeed': 1.00,
        'tileSize': 1.6021,
        'frequency': 3.57,
        'shadowHue': 0.25
    },

    2: {
        'drawMode': 0,
        'shadowMode': 0,
        'timeSpeed': 1.00,
        'tileSize': 1.7404,
        'frequency': 3.57,
        'shadowHue': 0.25
    },

    3: {
        'drawMode': 2,
        'shadowMode': 2,
        'timeSpeed': 0.75,
        'tileSize': 0.9031,
        'frequency': 4.44,
        'shadowHue': 0.275
    },

    4: {
        'drawMode': 2,
        'shadowMode': 2,
        'timeSpeed': 0.75,
        'tileSize': 0.,
        'frequency': 4.90,
        'shadowHue': 0.275
    },

    5: {
        'drawMode': 3,
        'shadowMode': 2,
        'timeSpeed': 0.75,
        'tileSize': 0.8451,
        'frequency': 4.44,
        'shadowHue': 0.275
    },

    6: {
        'drawMode': 3,
        'shadowMode': 2,
        'timeSpeed': 0.75,
        'tileSize': 0.,
        'frequency': 4.90,
        'shadowHue': 0.275
    },

    7: {
        'drawMode': 3,
        'shadowMode': 2,
        'timeSpeed': -0.85,
        'tileSize': 0.,
        'frequency': 4.43,
        'shadowHue': 0.275
    }

};