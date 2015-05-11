// Radial "lines" are sent out at angles [0, dt, 2dt, ..., (T-1)*dt].
var T = 90;
var dt = 2 * Math.PI / T;

// Each "line" is composed of numsegs segments. Each successive segment vertex is drawn at coordinates [x,y] chosen uniformly at random from [segrangex, segrangey] (relative to the previous segment vertex). 
var segrangex = [50, 200];
var segrangey = [-10, 10];
var numsegs = 15;

// Keep track of the number of frames so far.
var time = 0;

// Value between 0 and 1 controlling fill hue.
var fill_h = 0;
var fill_h3 = 0;

// Value between 0 and 1 controlling fill brightness.
var fill_b = 0;

// Value between 0 and 1 controlling fill alpha.
var fill_a = 0;

// Rate of change of fill_h.
var df;

// Tracks whether fill_h should be adding or subtracting df.
var dfsign = 1;

// Audio input.
var audio;

// Audio input volume.
var vol;

// FFT object, takes a Fourier transform of the sound buffer.
var fft;

// Array containing the FFT spectrum values.
var spectrum;

// Values containing the energy of certain portions of the FFT spectrum.
var energyl;  // low (bass) range energy.
var energylm; // low-mid range energy.
var energym;  // mid range energy.
var energyhm; // high-mid range energy.
var energyh;  // high (treble) range energy.
var energy = 0;   // total spectral energy.

// Values containing the frame-to-frame change in energy.
var denergyl;
var denergylm;
var denergym;
var denergyhm;
var denergyh;
var denergy;

// Smoothed changes in energy.
var denergylsmoothed = 0;
var denergylmsmoothed = 0;
var denergymsmoothed = 0;
var denergyhmsmoothed = 0;
var denergyhsmoothed = 0;
var denergysmoothed = 0;

var specdata;

var pixdecay = true;

function setup()
{
	// Create the display canvas.
	createCanvas(512, 512);

	// Make the screen black.
	background(0);

	// Set the color mode.
	colorMode(HSB, 1);
	
	// Initialize audio input.
	audio = new p5.AudioIn();
	audio.start();
	//audio.connect();
	//console.log(audio.listSources());
	
	// Initialize the FFT object.
	fft = new p5.FFT(0.8);
	fft.setInput(audio);
}

function draw() {
	// Increment time.
	time += 1;

	// Get the volume level of the current sound buffer. Range [0, 1].
	//vol = audio.getLevel();
	//audio.amp(1);

	// Get the spectrum of the current sound buffer. Range [0, 255].
	spectrum = fft.analyze();

	// Get energy values in the predefined spectral ranges.
	denergyl = energyl;
	energyl = fft.getEnergy("bass");
	denergyl = Math.abs(energyl - denergyl);

	denergylm = energylm;
	energylm = fft.getEnergy("lowMid");
	denergylm = Math.abs(energylm - denergylm);

	denergym = energym;
	energym = fft.getEnergy("mid");
	denergym = Math.abs(energym - denergym);

	denergyhm = energyhm;
	energyhm = fft.getEnergy("highMid");
	denergyhm = Math.abs(energyhm - denergyhm);

	denergyh = energyh;
	energyh = fft.getEnergy("treble");
	denergyh = Math.abs(energyh - denergyh);

	denergy = energy;
	energy = fft.getEnergy(20, 20000);
	denergy = Math.abs(energy - denergy);

	// Ignore energy changes smaller than these thresholds
	var delthresh = 10;
	var delmthresh = 10;
	var demthresh = 10;
	var dehmthresh = 10;
	var dehthresh = 10;
	var dethresh = 8;

	// denergysmoothed decay rate
	var dedecay = 0.9;

	if (denergyl > delthresh) {
		denergylsmoothed += denergyl;
	}
	if (denergylm > delmthresh) {
		denergylmsmoothed += denergylm;
	}
	if (denergym > demthresh) {
		denergymsmoothed += denergym;
	}
	if (denergyhm > dehmthresh) {
		denergyhmsmoothed += denergyhm;
	}
	if (denergyh > dehthresh) {
		denergyhsmoothed += denergyh;
	}
	if (denergy > dethresh) {
		denergysmoothed += denergy;
	}

	denergylsmoothed *= dedecay;
	denergylmsmoothed *= dedecay;
	denergymsmoothed *= dedecay;
	denergyhmsmoothed *= dedecay;
	denergyhsmoothed *= dedecay;
	denergysmoothed *= dedecay;


	//var volscale = 1;//(vol === 0) ? 0 : 0.01/vol;

	// Scale segment x length distribution using bass energy levels.
	var xsmooth = 0.1	;
	segrangex[0] = xsmooth * segrangex[0] + (1-xsmooth) * (0.5 * (0.5 + energyl / 4 + denergylsmoothed / 1.5 + denergylmsmoothed / 1.5));
	segrangex[1] = 0.7 * (5 + energyl / 0.5);

	// Scale segment y length distribution using mid energy levels and
	// high-mid energy levels.
	var ev = 0.013 * Math.pow(energylm, 1.52)
	segrangey[0] = -ev;
	segrangey[1] = ev;

	// Update fill_h and fill_a. Use info about the maximum band energy
	// amplitude and frequency to set values.
	specdata = arraymax(spectrum);
	//fill_h = specdata[1] / spectrum.length;
	fill_a = 0.06;// * constrain(specdata[0] / 20, 0, 1);
	fill_b = 1;//constrain(3 * energy / 255, 0, 1);


	// Update fill_h, df, and dfsign.
	df = dfsign * 0.0005 * Math.pow(energyh / 90, 2);
	fill_h = constrain(fill_h + df, 0, 1);
	fill_h3 = fill_h + constrain(5 * denergysmoothed / 255, 0, 1);
	if (fill_h === 1 || fill_h === 0) {
		dfsign *= -1;
	}
	// Fill is set within the newline function, so that it can vary
	// within a single "line".
	//fill(fill_h, 1, 1, 0.03);
	//stroke(1-fill_h, 1, 1, 0.06);

	// Stroke weight ranges from 0.05 to 1.05, changes over time.
	var strokeweight = 0.08;//constrain(0.01 + energylm / 20., 0, 0.3);
	strokeWeight(strokeweight);

	// Create a "line" emanating from the center of the window at a
	// range of angles in [0, 2*PI].
	for (var t = 0; t < T; t++) {
		// Rotation angle for the next "line".
		var angle = t * dt;

		push();
		translate(width / 2, height / 2);
		rotate(angle);

		// Draw the "line".
		newline();

		pop();
	}

	// If pixdecay is true, make the pixels fade to black
	if(pixdecay)
	{
		loadPixels();
		for (var i = 0; i < 4 * width * height; i++) {
			pixels[i] *= 0.94;
		}
		updatePixels();
	}
}

// Draw a new "line".
function newline()
{
	// Additional fill variable, to allow the color to change throughout
	// the "line".
	var fill_h2 = 0;

	// Rate of change of fill_h2.
	var df2 = 0;//.00005 * (energyh + energyhm);

	// Draw the "line".
	beginShape();
	//vertex(0, 0);
	for(var i = 0; i < numsegs; i++)
	{
		// Increment fill_h2.
		fill_h2 += df2;

		// Create the final fill hue.
		var fhue = (fill_h3 + fill_h2 + fill_b) % 1;
		fill(fhue, 1, fill_b, fill_a);

		var stroke_a = 20 * fill_a * constrain(segrangey[1] / 50, 0, 1)
		stroke(0, 0, fill_b, stroke_a);

		// [x,y] coordinates of the next vertex.
		var x = i * segrangex[0];//segrangex[0] + random(segrangex[1]-segrangex[0]);
		var y = segrangey[0] + random(segrangey[1]-segrangey[0]);
		vertex(x,y);
		
		// Recenter coordinate system on the current vertex.
		//translate(x, 0);
	}
	endShape();
}

function arraymax(arr)
{
	// Returns the largest value in array arr, as well as the index
	// of the first occurrence of that value.
	var maxval = 0;
	var maxidx = 0;
	for(var i = 0; i < arr.length; i++)
	{
		if(arr[i] > maxval)
		{
			maxval = arr[i];
			maxidx = i;
		}
	}

	return [maxval, maxidx]
}

function keyTyped()
{
	// Press c to clear the canvas.
	if(key === 'c' || key === 'C')
	{
		background(0);
	}

	// Press c to toggle pixel decay.
	if(key === 'd' || key === 'D')
	{
		pixdecay = !pixdecay;
	}
}