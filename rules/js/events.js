function onMouseMove(evt) {
    let e = evt.originalEvent;
    let x = canvasScale * e.clientX * screenInverse.x;
    let y = 1. - canvasScale * e.clientY * screenInverse.y;
    mousePositionNow.set(x, y);
}


function onTouchStart(evt) {
    evt.preventDefault();
    let touch = evt.touches[0];
    let x = canvasScale * touch.clientX * screenInverse.x;
    let y = 1. - canvasScale * touch.clientY * screenInverse.y;
    mousePositionNow.set(x, y);
    clicked = true;
}


function onTouchMove(evt) {
    onTouchStart(evt);
}


function onClick(evt) {
    clicked = true;
}