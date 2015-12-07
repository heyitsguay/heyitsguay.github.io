
const maxVertices = 1000000;

/**
 * List of all living Vines.
 *
 * @constructor
 */
function VineList() {

    // list of all the Vines currently displayed.
    this.vines = [];

    // AttributeArray with Vine vertex position data.
    this.aa_position = new AttributeArray('a_position', maxVertices, 2, true);

    // AttributeArray with Vine vertex color data.
    this.aa_color = new AttributeArray('a_color', maxVertices, 3, true);

    // AttributeArray with Vine vertex life remaining (in [0,1]).
    this.aa_lifeleft = new AttributeArray('a_lifeleft', maxVertices, 1, true);

    this.vertexCount = 0;
}