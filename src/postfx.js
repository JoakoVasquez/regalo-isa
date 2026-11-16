// Post-procesado "consola de 2006": todo se dibuja a 480p, con un brillo suave (bloom),
// un filtro que ablanda la imagen como la salida de vídeo de la época y colores un poco más vivos.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SoftTVShader = {
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 854, 1 / 480) } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      vec3 c  = texture2D(tDiffuse, vUv).rgb;
      vec3 up = texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb;
      vec3 dn = texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
      vec3 lf = texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb;
      vec3 rt = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb;
      // filtro "anti-parpadeo": mezcla cada línea con sus vecinas (más en vertical)
      vec3 soft = c * 0.5 + (up + dn) * 0.19 + (lf + rt) * 0.06;
      c = mix(c, soft, 0.75);
      // un poco más de saturación y contraste
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.14);
      c = (c - 0.5) * 1.03 + 0.5;
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export class PostFX {
  constructor(renderer) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(854, 480), 0.055, 0.6, 0.97);
    this.soft = new ShaderPass(SoftTVShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.soft);
    this.composer.addPass(new OutputPass());
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.soft.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  render(scene, camera) {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }
}
