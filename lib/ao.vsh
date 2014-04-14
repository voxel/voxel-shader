attribute vec4 attrib0;
attribute vec4 attrib1;
attribute vec4 attrib2;

uniform mat4 projection;
uniform mat4 view;
uniform mat4 model;
uniform float tileCount;

varying vec3  normal;
varying vec2  tileCoord;
varying float tileSize;
varying vec2  texCoord;
varying float ambientOcclusion;

void main() {
  //Compute position
  vec3 position = attrib0.xyz;
  
  //Compute ambient occlusion
  ambientOcclusion = attrib0.w / 255.0;
  
  //Extracted packed bits of normal. GLSL 1.0 doesn't support bitfieldExtract or even bitwise operations :(
  int packedNormal = int(attrib1.x);
  int nx = packedNormal / 16;               // xx____
  int ny = packedNormal / 4 - nx * 4;       // __xx__
  int nz = packedNormal - nx * 16 - ny * 4; // ____xx

  normal = 128.0 - vec3(nx + 127, ny + 127, nz + 127);
  
  //Compute texture coordinate
  texCoord = vec2(dot(position, vec3(normal.y-normal.z, 0, normal.x)),
                  dot(position, vec3(0, -abs(normal.x+normal.z), normal.y)));
  
  //Compute tile coordinate
  tileSize    = pow(2.0, attrib1.y);
  float tx    = (attrib1.z * 256.0 + attrib1.w) / tileCount; // 16-bit
  tileCoord.x = floor(tx);
  tileCoord.y = fract(tx) * tileCount;
  
  gl_Position = projection * view * model * vec4(position, 1.0);
}
