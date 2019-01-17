// Modulo operation variant with no negative numbers.
function mod(m, n)
{
    return ((m % n) + n) % n;
}

// Generates random numbers from an exponential distribution with parameter L.
function randexp(L)
{
    var u = Math.random();
    return Math.log(1 - u) / (-L);
}

// Returns -1 if x<0, 0 if x==0, 1 if x>0.
function sign(x)
{
    return (x > 0) - (x < 0);
}

// Updates the list of random values used by the Foragers in their movement.
function changeRands()
{
    var newrands = [];
    for(var i=0; i < foragers.length; i++)
    {
        newrands.push(Math.random() - 0.5);
    }
    dthrands = newrands;
}