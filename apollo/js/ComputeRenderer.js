/**
 * @author heyitsguay https://github.com/heyitsguay
 *
 * ComputeRenderer, based on GPUComputationRenderer by yomboprime
 * (https://github.com/yomboprime)
 * Accessed from a three.js example
 * (https://github.com/mrdoob/three.js/blob/master/examples/js/GPUComputationRenderer.js)
 *
 * @constructor
 * @param {WebGLRenderer} renderer - The renderer.
 */
function ComputeRenderer(renderer) {
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

    // The Mesh containing the pass-through ShaderMaterial
    this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), this.passThruShader(2, 2));
    this.scene.add(this.mesh);

}


/**
 * Add texture resolution information to a material's shader as a GLSL
 * macro. Defines the vec2 'resolution'.
 *
 * @param {ShaderMaterial} material - The material.
 * @param {int} sizeX - Material texture x size.
 * @param {int} sizeY - Material texture y size.
 */
ComputeRenderer.prototype.addResolutionDefine = function(material, sizeX, sizeY) {
    material.defines.resolution = 'vec2(' + sizeX + '., ' + sizeY + '.)';
};


/**
 * Add a variable to the ComputeRenderer.
 *
 * @param {String} variableName - The variable's name.
 * @param {String} fragmentShader - Source code for the fragment shader
 *  doing this variable's computation.
 * @param {Object} uniforms - Dictionary of uniform variables used by this
 *  variable's fragment shader.
 * @param {function} initialValueFiller - Handle to a function that
 *  creates the variable's initial values.
 * @param {int} sizeX - Variable texture x size.
 * @param {int} sizeY - Variable texture y size.
 */
ComputeRenderer.prototype.addVariable = function(variableName, fragmentShader, uniforms, initialValueFiller, sizeX, sizeY, minFilter, magFilter) {

    minFilter = minFilter || THREE.NearestFilter;
    magFilter = magFilter || THREE.NearestFilter;

    // Create the computation shader material
    let material = this.createShaderMaterial(fragmentShader, sizeX, sizeY, uniforms);

    let texture = this.createTexture(sizeX, sizeY);
    initialValueFiller(texture);

    // Create the variable!
    let variable = {
        name: variableName,
        initialValueTexture: texture,
        material: material,
        dependencies: null,
        renderTargets: [],
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        minFilter: minFilter,
        magFilter: magFilter
    };
    // Add it to the variable list
    this.variables.push(variable);

};


/**
 * Return the alternate (not current) render target from the input
 * variable's ping-pong buffers.
 *
 * @param variableName - Get the alternate render target for the
 *  variable with this name.
 * @return {WebGLRenderTarget} - The input variable's alternate render target.
 */
ComputeRenderer.prototype.alternateRenderTarget = function(variableName) {
    let variable = this.getVariableByName(variableName);
    return variable.renderTargets[1 - this.currentPingPongIndex];
};


ComputeRenderer.prototype.compute = function() {
    let currentIndex = this.currentPingPongIndex;
    let nextIndex = 1 - this.currentPingPongIndex;

    for (let i = 0; i < this.variables.length; i++) {
        let v = this.variables[i];

        // Set v's dependency uniform values
        if (v.dependencies !== null) {
            let uniforms = v.material.uniforms;

            for (let d = 0; d < v.dependencies.length; d++) {
                let depVar = v.dependencies[d];
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
 * @param {int} sizeX - Texture x size for the material.
 * @param {int} sizeY - Texture y size for the material.
 * @param uniforms - Dictionary of shader uniforms.
 * @return {ShaderMaterial} - The completed ShaderMaterial.
 */
ComputeRenderer.prototype.createShaderMaterial = function(fragmentShader, sizeX, sizeY, uniforms) {
    // No uniforms by default
    uniforms = uniforms || {};

    // Create the ShaderMaterial
    let material = new THREE.ShaderMaterial( {
        uniforms: uniforms,
        vertexShader: passThruVertexShader(),
        fragmentShader: fragmentShader
    });
    // Add texture resolution information as a GLSL macro
    // this.addResolutionDefine(material, sizeX, sizeY);

    return material;
};


/**
 * Create a texture.
 * @param {int} sizeX - Texture width.
 * @param {int} sizeY - Texture height.
 * @returns {DataTexture} - The new texture.
 */
ComputeRenderer.prototype.createTexture = function(sizeX, sizeY) {
    // Empty initializer array
    let emptyArray = new Float32Array(sizeX * sizeY * 4);

    // Create a data texture
    let texture = new THREE.DataTexture(emptyArray, sizeX, sizeY, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;

    return texture;
};


/**
 * Return the current render target from the input variable's ping-pong
 * buffers.
 *
 * @param {String} variableName - Get the current render target for the
 *  variable with this name.
 * @return {WebGLRenderTarget} - The input variable's current render target.
 */
ComputeRenderer.prototype.currentRenderTarget = function(variableName) {
    let variable = this.getVariableByName(variableName);
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
    this.renderer.setSize(target.width, target.height);
    // Perform the actual rendering
    this.renderer.render(this.scene, this.camera, target);
};


/**
 * Get a variable in this.variables by its name
 * @param {String} variableName - name of the variable
 * @returns {*} - The variable with name variableName, or null if no
 *  variable is found.
 */
ComputeRenderer.prototype.getVariableByName = function(variableName) {
    for (let i = 0; i < this.variables.length; i++) {
        let variable = this.variables[i];
        if(variable.name === variableName) {
            return variable;
        }
    }
    return null;
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
    if (this.renderer.capabilities.maxVertexTextures === 0) {
        return "No support for vertex shader textures."
    }

    for (let i = 0; i < this.variables.length; i++) {
        // Set up variable i
        let v = this.variables[i];

        // Create render targets, initialize them with the input texture.
        // Use two targets to form a ping-pong buffer
        for (let j = 0; j < 2; j++) {
            v.renderTargets[j] = this.createRenderTarget(
                v.initialValueTexture.image.width,
                v.initialValueTexture.image.height,
                v.wrapS,
                v.wrapT,
                v.minFilter,
                v.magFilter);
            this.initializeTexture(v.initialValueTexture, v.renderTargets[j]);
        }

        // Add dependency uniforms to v's ShaderMaterial
        let material = v.material;
        let uniforms = material.uniforms;
        if (v.dependencies !== null) {
            for (let d = 0; d < v.dependencies.length; d++) {
                let depVar = v.dependencies[d];

                // Check if depVar exists
                if (depVar.name !== v.name) {
                    let found = false;
                    for (let k = 0; k < this.variables.length; k++) {
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
 * @param {DataTexture} texture - The texture to render.
 * @param {WebGLRenderTarget} target - Render target for the texture rendering.
 */
ComputeRenderer.prototype.initializeTexture = function(texture, target) {
    let initShader = this.passThruShader(texture.image.width, texture.image.height);
    this.passThruUniforms.texture.value = texture;
    this.doRenderTarget(initShader, target);
    this.passThruUniforms.texture.value = null;
};


ComputeRenderer.prototype.passThruShader = function(sizeX, sizeY) {
    let material = this.createShaderMaterial(
        passThruFragmentShader(),
        sizeX,
        sizeY,
        this.passThruUniforms);
    this.addResolutionDefine(material, sizeX, sizeY);
    return material;
};

/**
 * A variable may depend on others to perform its computation. Add those
 * dependencies here.
 *
 * @param {String} variableName - Modify the dependencies of the
 *  ComputeRenderer variable with this name.
 * @param {String[]} dependencyNames - The list of names of
 *  ComputeRenderer variables upon which the input variable depends.
 */
ComputeRenderer.prototype.setVariableDependencies = function(variableName, dependencyNames) {
    let variable = this.getVariableByName(variableName);
    variable.dependencies = dependencyNames.map((name) => this.getVariableByName(name));
};


/**
 * Return the GLSL code for the pass-through fragment shader as a string.
 *
 * @return {String} - Fragment shader code.
 */
function passThruFragmentShader() {
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
function passThruVertexShader() {

    return 'void main() {\n' +
        '\n' +
        '   gl_Position = vec4(position, 1.);\n' +
        '\n' +
        '}\n';
}
