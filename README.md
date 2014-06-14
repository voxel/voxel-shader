voxel-shader
============
Shader for use with [voxel-mesher](https://github.com/deathcap/voxel-mesher).

Based on @mikolalysenko's [ao-shader](https://github.com/mikolalysenko/ao-shader)

Requires [voxel-stitch](https://github.com/deathcap/voxel-stitch) for textures,
[game-shell-fps-camera](https://github.com/deathcap/game-shell-fps-camera) for camera view matrix,
and indirectly [voxel-mesher](https://github.com/deathcap/voxel-mesher)
through `game.voxels.meshes`.

## Usage

Load with [voxel-plugins](https://github.com/deathcap/voxel-plugins)

Options:

* `perspectiveResize`: if true (default), listens for `gl-resize` [game-shell](https://github.com/mikolalysenko/game-shell) event and updates projection matrix
* `cameraNear`, `cameraFar`: camera near and far clipping planes
* `cameraFOV`: field of view in degrees (note: call `updateProjectionMatrix()` after changing any of the camera options, see [camera-debug](https://github.com/deathcap/camera-debug))

When the plugin is enabled, it will automatically listen for `gl-init` and `gl-render`
events from game-shell, for initializing and rendering the scene.

## Operation

Voxels are rendered in two passes, refer to the
[voxel-mesher](https://github.com/deathcap/voxel-mesher) documentation for further details.

#Credits
(c) 2013 Mikola Lysenko, (c) 2014 deathcap. MIT License
