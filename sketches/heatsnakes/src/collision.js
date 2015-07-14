var forager;
function collisionDetect()
{
    // Clear previous tree data
    tree.clear();

    // Insert Pellets and Foragers into the quadtree
    tree.insert(pellets);
    tree.insert(foragers);

    // Check Foragers for collisions.
    for(var i=0; i<foragers.length; i++)
    {
        forager = foragers[i];
        tree.retrieve(forager, function(item){collide(forager, item)});
    }
}

function collide(obj0, obj1)
{
    if(obj0 === obj1 || obj1.alreadyCollided)
    {
        return;
    }
    // Assumes obj0 is a Forager. obj1 may be a Forager or Pellet
    var dx = (obj1.xc - obj0.xc);
    var dy = (obj1.yc - obj0.yc);
    var drad2 = dx*dx + dy*dy + 0.00001;
    if(drad2 < obj0.rad2 + obj1.rad2)
    {
        // Collision happened.
        if(obj1.type == 'pellet')
        {
            // Remove the Pellet and absorb its heat.
            obj0.heat += obj1.heat;
            pelletsLimbo.push(obj1);
            _.pull(pellets, obj1);
            pellets.redraw = true;
        }
        else if(obj1.type == 'forager' && foragerCollision)
        {
            // Bounce off each other
            var cmag = Math.sqrt(drad2); // collision normal magnitude
            var cnormalx = dx / cmag; // normalized collision normal x value.
            var cnormaly = dy / cmag; // normalized collision normal y value.waaaa

            var d0dotn = obj0.dr * Math.cos(obj0.th) * cnormalx + obj0.dr * Math.sin(obj0.th) * cnormaly;
            var d1dotn = - obj1.dr * Math.cos(obj1.th) * cnormalx - obj1.dr * Math.sin(obj1.th) * cnormaly;

            var deltax = d1dotn * cnormalx + d0dotn * cnormalx;
            deltax = sign(deltax) * Math.max(0.05, Math.abs(deltax));

            var deltay = d1dotn * cnormaly + d0dotn * cnormaly;
            deltay = sign(deltay) * Math.max(0.05, Math.abs(deltay));

            //var dx0 = obj0.dr * Math.cos(obj0.dth) - obj0.bounce * deltax;
            var dx0 = -obj0.bounce * deltax;
            //var dy0 = obj0.dr * Math.sin(obj0.dth) - obj0.bounce * deltay;
            var dy0 = -obj0.bounce * deltay;

            //var dx1 = obj1.dr * Math.cos(obj1.dth) + obj1.bounce * deltax;
            //var dy1 = obj1.dr * Math.sin(obj1.dth) + obj1.bounce * deltay;
            var dx1 = obj1.bounce + deltax;
            var dy1 = obj1.bounce + deltay;

            var c = collideHeatContribution(obj0, obj1);

            obj0.drcollide = Math.min(0.5 * maxfdr, c[1] * Math.sqrt(dx0 * dx0 + dy0 * dy0));
            obj0.dthcollide = 0.2 * c[1] * Math.atan2(dx0, dy0) + Math.PI * (dx0 < 0);

            obj1.drcollide = Math.min(0.5 * maxfdr, c[0] * Math.sqrt(dx1 * dx1 + dy1 * dy1));
            obj1.dthcollide = c[0] * 0.2 * Math.atan2(dx1, dy1) + Math.PI * (dx1 < 0);


            obj0.alreadyCollided = true;
            obj1.alreadyCollided = true;
        }
    }


}

function collideHeatContribution(obj0, obj1)
{
    var dheat = obj0.heat - obj1.heat;
    var c0 = Math.exp(0.06 * dheat);
    var c1 = 1 / c0;
    return [c0, c1];
}