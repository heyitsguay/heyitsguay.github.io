// Functions to handle changes to the sliders.

// Controls the scale of entities (updates when slider is no longer being clicked).
function escaleSlider(val)
{
    escale = parseFloat(val);
    $('#range-escale-disp').html(val);
    qualityChange();
}

// Displays the new entity scale (updates while slider is being clicked).
//noinspection JSUnusedGlobalSymbols
function escaleSlider2(val)
{
    $('#range-escale-disp').html(val);
}

// Controls how quickly heat values decay to 0.
function cdecaySlider(val)
{
    uniformValues.u_cdecay.data = 1 - Math.pow(2, -15+parseFloat(val));
    var disp = document.getElementById("range-cdecay-disp");
    disp.innerHTML = val;
}

// Controls the diffusion rate of the heat map.
function cdiffSlider(val)
{
    uniformValues.u_cdiff.data = 0.1666666 * parseFloat(val);
    var disp = document.getElementById("range-cdiff-disp");
    disp.innerHTML = val;
}

// Controls the base hue of the heat map.
function heatHSlider(val)
{
    uniformValues.u_heatH.data = parseFloat(val);
    var disp = document.getElementById("range-heatH-disp");
    disp.innerHTML = val;
}
