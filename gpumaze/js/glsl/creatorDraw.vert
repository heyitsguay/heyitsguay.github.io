attribute float index;

uniform vec2 numTiles;
uniform sampler2D creators;

varying float vCreatorState;

const float pointSize = 0.5;

void main() {
    float indexX = floor(index / numTiles[0]);
    float indexY = index - numTiles[0] * indexX;
    vec4 creatorInfo = texture2D(creators, vec2(indexX, indexY));
    vec2 creatorPosition = creatorInfo.xy;
    vCreatorState = creatorInfo.z;
    gl_PointSize = pointSize;
    gl_Position = vec4(creatorPosition, 0., 1.);
}