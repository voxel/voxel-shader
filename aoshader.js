var fs = require("fs")
var createShader = require("gl-shader")

var mat4 = require('gl-matrix').mat4

module.exports = function(game, opts) {
  return new ShaderPlugin(game, opts);
};
module.exports.pluginInfo = {
  clientOnly: true,
  loadAfter: ['voxel-stitch'],
};

function ShaderPlugin(game, opts) {
  this.shell = game.shell;

  this.stitcher = game.plugins.get('voxel-stitch');
  if (!this.stitcher) throw new Error('voxel-shader requires voxel-stitch plugin'); // for tileCount uniform below

  this.perspectiveResize = opts.perspectiveResize !== undefined ? opts.perspectiveResize : true;

  this.enable();
}

ShaderPlugin.prototype.enable = function() {
  this.shell.on('gl-init', this.onInit = this.ginit.bind(this));
  this.shell.on('gl-render', this.onRender = this.render.bind(this));
  if (this.perspectiveResize) this.shell.on('gl-resize', this.onResize = this.resize.bind(this));
};

ShaderPlugin.prototype.disable = function() {
  this.shell.removeListener('gl-init', this.onInit);
  this.shell.removeListener('gl-render', this.onRender);
  if (this.onResize) this.shell.removeListener('gl-resize', this.onResize);
};

ShaderPlugin.prototype.ginit = function() {
  this.shader = this.createAOShader();
  this.resize();
  this.modelMatrix = mat4.identity(new Float32Array(16)) // TODO: merge with view into modelView? or leave for flexibility?
};

ShaderPlugin.prototype.resize = function() {
  //Calculation projection matrix
  this.projectionMatrix = mat4.perspective(new Float32Array(16), Math.PI/4.0, this.shell.width/this.shell.height, 1.0, 1000.0)
};

ShaderPlugin.prototype.render = function() {
  var gl = this.shell.gl

  this.viewMatrix = this.shell.camera.view() // TODO: expose camera through a plugin instead?

  gl.enable(gl.CULL_FACE)
  gl.enable(gl.DEPTH_TEST)

  //Bind the shader
  var shader = this.shader
  shader.bind()
  shader.attributes.attrib0.location = 0
  shader.attributes.attrib1.location = 1
  shader.uniforms.projection = this.projectionMatrix
  shader.uniforms.view = this.viewMatrix
  shader.uniforms.model = this.modelMatrix
  shader.uniforms.tileCount = this.stitcher.tileCount

  // TODO: relocate variables off of game.shell (texture, meshes)

  var texture = this.stitcher.texture
  if (texture) shader.uniforms.tileMap = texture.bind() // texture might not have loaded yet

  for (var i = 0; i < this.shell.meshes.length; ++i) {
    var mesh = this.shell.meshes[i];
    mesh.triangleVAO.bind()
    gl.drawArrays(gl.TRIANGLES, 0, mesh.triangleVertexCount)
    mesh.triangleVAO.unbind()
  }
};

ShaderPlugin.prototype.createAOShader = function() {
  return createShader(this.shell.gl,
    fs.readFileSync(__dirname+"/lib/ao.vsh"),
    fs.readFileSync(__dirname+"/lib/ao.fsh"))
};
