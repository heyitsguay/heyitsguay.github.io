/**
 * @author heyitsguay https://github.com/heyitsguay
 *
 * ComputeRenderer, based on GPUComputationRenderer by yomboprime
 * (https://github.com/yomboprime)
 * Accessed from a three.js example
 * (https://github.com/mrdoob/three.js/blob/master/examples/js/GPUComputationRenderer.js)
 *
 * @constructor
 * @param {int} sizeX - Computation array is a 2D texture with this x size.
 * @param {int} sizeY - Computation array is a 2D texture with this y size.
 * @param {WebGLRenderer} renderer - The renderer.
 */
function ComputeRenderer(sizeX, sizeY, renderer) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.renderer = renderer;

    // List of all variables
    this.variables = [];
    // Index of the current read texture in the ping pong buffers.
    this.currentPingPongIndex = 0;

    // Add compute objects to this scene
    this.scene = new THREE.Scene();
    // Needs a camera
    this.camera = new THREE.Camera();
    this.camera.position.z = 1; // Sure why not

    // Uniforms for the pass-through shader
    this.passThruUniforms = {
        texture: {value: null}
    };
    // The pass-through shader. Renders a texture to a render target
    this.passThruShader = this.createShaderMaterial(passThroughFragmentShader(), this.passThruUniforms);

    // The Mesh containing the pass-through ShaderMaterial
    this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.passThruShader);
    this.scene.add(this.mesh);

}


/**
 * Add texture resolution information to a material's shader as a GLSL macro.
 *
 * @param {ShaderMaterial} material - The material.
 */
ComputeRenderer.prototype.addResolutionDefine = function(material) {
    material.defines.resolution = 'vec2(' + this.sizeX + '., ' + this.sizeY + '.)';
};


/**
 * Add a variable to the ComputeRenderer.
 *
 * @param {String} variableName - The variable's name.
 * @param {String} fragmentShader - Source code for the fragment shader
 *  doing this variable's computation.
 * @param {function} initialValueFiller - Handle to a function that
 *  creates the variable's initial values.
 * @param {int|None} sizeX -
 * @param {int|None} sizeY -
 * @return variable - The new variable.
 */
ComputeRenderer.prototype.addVariable = function(variableName, fragmentShader, initialValueFiller, sizeX, sizeY) {
    sizeX = sizeX || this.sizeX;
    sizeY = sizeY || this.sizeY;

    // Create the computation shader material
    var material = this.createShaderMaterial(fragmentShader);

    var texture = this.createTexture(sizeX, sizeY);
    initialValueFiller(texture);

    // Create the variable!
    var variable = {
        name: variableName,
        initialValueTexture: texture,
        material: material,
        dependencies: null,
        renderTargets: [],
        wrapS: null,
        wrapT: null,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter
    };
    // Add it to the variable list
    this.variables.push(variable);

    return variable;
};


/**
 * Return the alternate (not current) render target from the input
 * variable's ping-pong buffers.
 *
 * @param variable - Get the alternate render target for this variable.
 * @return {WebGLRenderTarget} - The input variable's alternate render target.
 */
ComputeRenderer.prototype.alternateRenderTarget = function(variable) {
    return variable.renderTargets[1 - this.currentPingPongIndex];
};


ComputeRenderer.prototype.compute = function() {
    var currentIndex = this.currentPingPongIndex;
    var nextIndex = 1 - this.currentPingPongIndex;

    for (var i = 0; i < this.variables.length; i++) {
        var v = this.variables[i];

        // Set v's dependency uniform values
        if (v.dependencies !== null) {
            var uniforms = v.material.uniforms;

            for (var d = 0; d < v.dependencies.length; d++) {
                var depVar = v.dependencies[d];
                uniforms[depVar.name].value = depVar.renderTargets[currentIndex].texture;
            }
        }

        // Perform this variable's computation
        this.doRenderTarget(v.material, v.renderTargets[nextIndex]);
    }

    this.currentPingPongIndex = nextIndex;

};


/**
 * Create a render target for a variable's compute shader.
 *
 * @param {int|None} sizeX - Render target width.
 * @param {int|None} sizeY - Render target height.
 * @param wrapS - Horizontal texture wrap mode.
 * @param wrapT - Vertical texture wrap mode.
 * @param minFilter - Texture minimization scale filter.
 * @param magFilter - Texture magnification scale filter.
 * @returns {WebGLRenderTarget} - The new render target.
 */
ComputeRenderer.prototype.createRenderTarget = function(sizeX, sizeY, wrapS, wrapT, minFilter, magFilter) {
    // Use default values if not supplied
    // Render target (and also variable texture) size
    sizeX = sizeX || this.sizeX;
    sizeY = sizeY || this.sizeY;

    // How to handle texture accesses outside s in [0,1], t in [0,1]? By
    // default, clamp to the edge
    wrapS = wrapS || THREE.ClampToEdgeWrapping;
    wrapT = wrapT || THREE.ClampToEdgeWrapping;

    // Texture scaling filter. By default, use nearest-neighbor
    minFilter = minFilter || THREE.NearestFilter;
    magFilter = magFilter || THREE.NearestFilter;

    // Create a WebGLRenderTarget!
    return new THREE.WebGLRenderTarget(sizeX, sizeY, {
        wrapS: wrapS,
        wrapT: wrapT,
        minFilter: minFilter,
        magFilter: magFilter,
        format: THREE.RGBAFormat,
        type: (/(iPad|iPhone|iPod)/g.test(navigator.userAgent)) ? THREE.HalfFloatType : THREE.FloatType,
        stencilBuffer: false
    });
};


/**
 * Create a ShaderMaterial with the pass-through vertex shader and the
 * supplied fragment shader and uniforms.
 *
 * @param {String} fragmentShader - Fragment shader code.
 * @param uniforms - Dictionary of shader uniforms.
 * @return {ShaderMaterial} - The completed ShaderMaterial.
 */
ComputeRenderer.prototype.createShaderMaterial = function(fragmentShader, uniforms) {
    // No uniforms by default
    uniforms = uniforms || {};

    // Create the ShaderMaterial
    var material = new THREE.ShaderMaterial( {
        uniforms: uniforms,
        vertexShader: passThroughVertexShader(),
        fragmentShader: fragmentShader
    });
    // Add texture resolution information as a GLSL macro
    this.addResolutionDefine(material);

    return material;
};


/**
 * Create a texture.
 * @param {int|null} sizeX - Texture width.
 * @param {int|null} sizeY - Texture height.
 * @returns {DataTexture} - The new texture.
 */
ComputeRenderer.prototype.createTexture = function(sizeX, sizeY) {
    // Texture size. Use default values it none are supplied
    sizeX = sizeX || this.sizeX;
    sizeY = sizeY || this.sizeY;

    // Empty initializer array
    var emptyArray = new Float32Array(sizeX * sizeY * 4);

    // Create a data texture
    var texture = new THREE.DataTexture(emptyArray, sizeX, sizeY, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;

    return texture;
};


/**
 * Return the current render target from the input variable's ping-pong buffers.
 *
 * @param variable - Get the current render target for this variable.
 * @return {WebGLRenderTarget} - The input variable's current render target.
 */
ComputeRenderer.prototype.currentRenderTarget = function(variable) {
    return variable.renderTargets[this.currentPingPongIndex];
};


/**
 * Perform a render target's rendering.
 *
 * @param {ShaderMaterial} material - material containing the shader to be run.
 * @param {WebGLRenderTarget} target - The render target to render.
 */
ComputeRenderer.prototype.doRenderTarget = function(material, target) {
    // Assign the input shader material to this ComputeRenderer's mesh
    this.mesh.material = material;
    // Perform the actual rendering
    this.renderer.render(this.scene, this.camera, target);
    // Reset this ComputeRenderer's shader material
    this.mesh.material = this.passThruShader;
};


/**
 * Initialize the ComputeRenderer.
 *
 * @return {String|null} Text of any initialization errors which occur, or
 *  null if no errors occur.
 */
ComputeRenderer.prototype.init = function() {
    // Check for necessary WebGL extensions
    if (!this.renderer.extensions.get("OES_texture_float")) {
        return "No OES_texture_float support for float textures.";
    }
    if (!(this.renderer.capabilities.maxVertexTextures === 0)) {
        return "No support for vertex shader textures."
    }

    for (var i = 0; i < this.variables.length; i++) {
        // Set up variable i
        var v = this.variables[i];

        // Create render targets, initialize them with the input texture.
        // Use two targets to form a ping-pong buffer
        for (var j = 0; j < 2; j++) {
            v.renderTargets[j] = this.createRenderTarget(
                this.sizeX,
                this.sizeY,
                v.wrapS,
                v.wrapT,
                v.minFilter,
                v.magFilter);
            this.initalizeTexture(v.initialValueTexture, v.renderTargets[j]);
        }

        // Add dependency uniforms to v's ShaderMaterial
        var material = v.material;
        var uniforms = material.uniforms;
        if (v.dependencies !== null) {
            for (var d = 0; d < v.dependencies.length; d++) {
                var depVar = v.dependencies[d];

                // Check if depVar exists
                if (depVar.name !== v.name) {
                    var found = false;
                    for (var k = 0; k < v.length; v++) {
                        if (depVar.name === this.variables[k].name) {
                            found = true;
                            break;
                        }
                    }

                    // Return an error message if depVar is not found
                    if (!found) {
                        return "Variable [" + v.name + "] dependency [" +
                            depVar.name + "] not found.";
                    }
                }

                // Create the dependency uniform
                uniforms[depVar.name] = {value: null};

                // *Note*: Unlike the GPUComputationShader, this doesn't
                // prepend 'uniform sampler2D {depVar.name}' to the fragment
                // shader. Put it in there yourself!!
            }
        }


    }

    this.currentPingPongIndex = 0;

    return null;
};


/**
 * Render a texture from CPU to GPU using a render target.
 * @param {Float32Array} texture - The texture to render.
 * @param {WebGLRenderTarget} target - Render target for the texture rendering.
 */
ComputeRenderer.prototype.initalizeTexture = function(texture, target) {
    this.passThruUniforms.texture.value = texture;
    this.doRenderTarget(this.passThruShader, target);
    this.passThruUniforms.texture.value = null;
};


/**
 * A variable may depend on others to perform its computation. Add those
 * dependencies here.
 *
 * @param variable - Modify the dependencies of this variable.
 * @param dependencies - The list of variables upon which the input variable
 *  depends.
 */
ComputeRenderer.prototype.setVariableDependencies = function(variable, dependencies) {
    variable.dependencies = dependencies;
};


/**
 * Return the GLSL code for the pass-through fragment shader as a string.
 *
 * @return {String} - Fragment shader code.
 */
function passThroughFragmentShader() {
    return 'uniform sampler2D texture;\n' +
        '\n' +
        'void main() {\n' +
        '\n' +
        '    vec2 uv = gl_FragCoord.xy / resolution.xy;\n' +
        '\n' +
        '    gl_FragColor = texture2D(texture, uv);\n' +
        '\n' +
        '}\n';
}


/**
 * Return the GLSL code for the pass-through vertex shader as a string
 *
 * @return {String} - Vertex shader code.
 */
function passThroughVertexShader() {

    return 'void main() {\n' +
        '\n' +
        '   gl_position = vec4(position, 1.);\n' +
        '\n' +
        '}\n';
}