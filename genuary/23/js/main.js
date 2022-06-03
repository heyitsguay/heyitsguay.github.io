function draw() {
  background(25);
  noStroke();
  translate(-width/2, -height/2);
  // triangle(100, 100, 150, 150, 100, 150);
  leaf(0.5 + 0.2 * sin(0.02 * frameCount), 0.002 * (frameCount - sin(0.02 * frameCount)), 12, 0, 2, 10, 250, 30);
  // ellipse(0, 0, 50, 50);
}

function leaf(cx, cy, scale, angle, eccentricity, r, g, b) {
  push();
  fill(r, g, b);
  rotate(angle)
  cx = cx * width;
  cy = cy * height;
  let x0 = cx + scale;
  let y0 = cy - scale;
  let x1 = cx + scale;
  let y1 = cy + scale;
  let x2 = cx - eccentricity * scale;
  let y2 = cy;
  triangle(x0, y0, x1, y1, x2, y2);
  pop();
}

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight)
}
