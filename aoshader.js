var glslify = require("glslify")
var fs = require("fs")

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
};

ShaderPlugin.prototype.disable = function() {
  this.shell.removeListener('gl-init', this.onInit);
  this.shell.removeListener('gl-render', this.onRender);
  if (this.onResize) this.shell.removeListener('gl-resize', this.onResize);
  this.stitcher.removeListener('updateTexture', this.onUpdateTexture);
};

ShaderPlugin.prototype.texturesReady = function(texture) {
  this.texture = texture; // used in tileMap uniform
}

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

  //Bind the shader
  // phase 1 - solid blocks
  gl.disable(gl.BLEND)
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
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)  // TODO: premult alpha? https://github.com/deathcap/voxel-stitch/issues/6
  gl.enable(gl.BLEND)
  var shader2 = this.shader2
  shader2.bind()
  shader2.attributes.position.location = 0
  shader2.uniforms.view = this.viewMatrix
  shader2.uniforms.projection = this.projectionMatrix
  if (this.texture) shader2.uniforms.texture = this.texture.bind()

  for (k = 0; k < length; ++k) {
    var chunkIndex = keys[k]
    var mesh = this.meshes[chunkIndex]

    var blockMesh = mesh.vertexArrayObjects.porous
    if (blockMesh) {
      shader2.uniforms.model = this.meshes[chunkIndex].modelMatrix

      blockMesh.bind()
      blockMesh.draw(gl.TRIANGLES, blockMesh.length)
      blockMesh.unbind()
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
