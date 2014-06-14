var glslify = require("glslify")
var fs = require("fs")
var createBlockGeometry = require("block-models")

var mat4 = require('gl-matrix').mat4

module.exports = function(game, opts) {
  return new ShaderPlugin(game, opts);
};
module.exports.pluginInfo = {
  clientOnly: true,
  loadAfter: ['voxel-stitch', 'game-shell-fps-camera'],
};

function ShaderPlugin(game, opts) {
  this.shell = game.shell;

  this.stitcher = game.plugins.get('voxel-stitch');
  if (!this.stitcher) throw new Error('voxel-shader requires voxel-stitch plugin'); // for tileCount uniform and updateTexture event

  this.meshes = opts.meshes || game.voxels.meshes
  if (!this.meshes) throw new Error('voxel-shader requires "meshes" option or game.voxels.meshes set to array of voxel-mesher meshes')

  this.camera = game.plugins.get('game-shell-fps-camera');
  if (!this.camera) throw new Error('voxel-shader requires game-shell-fps-camera plugin'); // for camera view matrix

  this.perspectiveResize = opts.perspectiveResize !== undefined ? opts.perspectiveResize : true;
  this.cameraNear = opts.cameraNear !== undefined ? opts.cameraNear : 0.1;
  this.cameraFar = opts.cameraFar !== undefined ? opts.cameraFar : 200.0;
  this.cameraFOV = opts.cameraFOV !== undefined ? opts.cameraFOV : 45.0;

  this.projectionMatrix = mat4.create();

  this.enable();
}

ShaderPlugin.prototype.enable = function() {
  this.shell.on('gl-init', this.onInit = this.ginit.bind(this));
  this.shell.on('gl-render', this.onRender = this.render.bind(this));
  if (this.perspectiveResize) this.shell.on('gl-resize', this.onResize = this.updateProjectionMatrix.bind(this));
  this.stitcher.on('updateTexture', this.onUpdateTexture = this.texturesReady.bind(this));
  this.stitcher.preloadTexture('glass_blue');
};

ShaderPlugin.prototype.disable = function() {
  this.shell.removeListener('gl-init', this.onInit);
  this.shell.removeListener('gl-render', this.onRender);
  if (this.onResize) this.shell.removeListener('gl-resize', this.onResize);
  this.stitcher.removeListener('updateTexture', this.onUpdateTexture);
};

ShaderPlugin.prototype.texturesReady = function(texture) {
  this.texture = texture; // used in tileMap uniform

  /*
  this.setTestGeom(
    [{from: [0,0,0],
    to: [16,1,16],
    faceData: {
      down: {},
      up: {},
      north: {},
      south: {},
      west: {},
      east: {}
      },
    texture: 'glass_blue',
    }]);
    */
}

ShaderPlugin.prototype.setTestGeom = function(model) {
  var stitcher = this.stitcher;
  this.customGeomTest = createBlockGeometry(
    this.shell.gl,
    model,
    //getTextureUV:
    function(name) {
      return stitcher.getTextureUV(name); // only available when textures are ready
    }
  );
};

ShaderPlugin.prototype.ginit = function() {
  this.shader = this.createAOShader();
  this.shader2 = this.createCustomModelShader();
  this.updateProjectionMatrix();
  this.viewMatrix = mat4.create();

};

ShaderPlugin.prototype.updateProjectionMatrix = function() {
  mat4.perspective(this.projectionMatrix, this.cameraFOV*Math.PI/180, this.shell.width/this.shell.height, this.cameraNear, this.cameraFar)
};

ShaderPlugin.prototype.render = function() {
  var gl = this.shell.gl

  this.camera.view(this.viewMatrix)

  gl.enable(gl.CULL_FACE)
  gl.enable(gl.DEPTH_TEST)

  // TODO: is this right? see https://github.com/mikolalysenko/ao-shader/issues/2
  //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  //gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.BLEND)
  // premultiply alpha when loading textures, so can use gl.ONE blending, see http://stackoverflow.com/questions/11521035/blending-with-html-background-in-webgl
  // TODO: move to gl-texture2d?
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)

  //Bind the shader
  // phase 1 - solid blocks
  var shader = this.shader
  if (!shader) throw new Error('voxel-shader render() called before gl-init, shader=', this.shader)
  shader.bind()
  shader.attributes.attrib0.location = 0
  shader.attributes.attrib1.location = 1
  shader.uniforms.projection = this.projectionMatrix
  shader.uniforms.view = this.viewMatrix
  shader.uniforms.tileCount = this.stitcher.tileCount

  if (this.texture) shader.uniforms.tileMap = this.texture.bind() // if a texture is loaded

  var keys = Object.keys(this.meshes)
  var length = keys.length

  for (var k = 0; k < length; ++k) {
    var chunkIndex = keys[k]
    var mesh = this.meshes[chunkIndex]

    var triangleVAO = mesh.vertexArrayObjects.surface
    if (triangleVAO) {  // if there are triangles to render
      shader.uniforms.model = mesh.modelMatrix
      triangleVAO.bind()
      gl.drawArrays(gl.TRIANGLES, 0, triangleVAO.length)
      triangleVAO.unbind()
    }
  }

  // phase 2 - "porous" blocks
  var shader2 = this.shader2
  shader2.bind()
  shader2.attributes.position.location = 0
  shader2.uniforms.view = this.viewMatrix
  shader2.uniforms.projection = this.projectionMatrix
  if (this.texture) shader2.uniforms.texture = this.texture.bind()

  // test
  if (this.customGeomTest) {
    this.customGeomTest.bind()
    this.customGeomTest.draw(gl.TRIANGLES, this.customGeomTest.length)
    this.customGeomTest.unbind()
  }

  for (k = 0; k < length; ++k) {
    var chunkIndex = keys[k]
    var mesh = this.meshes[chunkIndex]

    var blockMeshes = mesh.vertexArrayObjects.porous
    if (blockMeshes) {
      for (var i = 0; i < blockMeshes.length; ++i) {
        var blockMesh = blockMeshes[i];

        shader2.uniforms.model = this.meshes[chunkIndex].modelMatrix

        blockMesh.bind()
        blockMesh.draw(gl.TRIANGLES, blockMesh.length)
        blockMesh.unbind()
      }
    }
  }
};

ShaderPlugin.prototype.createAOShader = function() {
  return glslify({
    vertex: './lib/ao.vsh',
    fragment: './lib/ao.fsh'
  })(this.shell.gl)
};

ShaderPlugin.prototype.createCustomModelShader = function() {
  // TODO: refactor with voxel-decals, voxel-chunkborder?
  return glslify({
   inline: true,
    vertex: "\
attribute vec3 position;\
attribute vec2 uv;\
\
uniform mat4 projection;\
uniform mat4 view;\
uniform mat4 model;\
varying vec2 vUv;\
\
void main() {\
  gl_Position = projection * view * model * vec4(position, 1.0);\
  vUv = uv;\
}",

  fragment: "\
precision highp float;\
\
uniform sampler2D texture;\
varying vec2 vUv;\
\
void main() {\
  gl_FragColor = texture2D(texture, vUv);\
}"})(this.shell.gl);
};
