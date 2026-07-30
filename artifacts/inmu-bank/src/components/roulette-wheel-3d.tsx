import { useEffect, useRef } from "react";
import * as THREE from "three";

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function createNumberTexture(number: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, 128, 128);
  context.fillStyle = "#fff8dc";
  context.font = "700 52px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(number), 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function RouletteWheel3D({
  resultNumber,
  spinning,
  onAnimationComplete,
}: {
  resultNumber: number | null;
  spinning: boolean;
  onAnimationComplete?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#050407");
    scene.fog = new THREE.Fog("#050407", 9, 17);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 6.2, 7.6);
    camera.lookAt(0, 0.25, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    mount.replaceChildren(renderer.domElement);

    scene.add(new THREE.HemisphereLight("#fff1c2", "#26080b", 2.2));
    const keyLight = new THREE.DirectionalLight("#ffd889", 5);
    keyLight.position.set(3, 8, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const redLight = new THREE.PointLight("#d51b31", 18, 14);
    redLight.position.set(-4, 2, 2);
    scene.add(redLight);

    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(4.35, 4.45, 0.55, 96),
      new THREE.MeshStandardMaterial({
        color: "#142c22",
        roughness: 0.52,
        metalness: 0.12,
      }),
    );
    table.position.y = -0.42;
    table.receiveShadow = true;
    scene.add(table);

    const wheel = new THREE.Group();
    scene.add(wheel);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.45, 3.55, 0.42, 96),
      new THREE.MeshStandardMaterial({
        color: "#8a5b12",
        metalness: 0.86,
        roughness: 0.2,
      }),
    );
    base.castShadow = true;
    wheel.add(base);
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(2.82, 3.12, 0.28, 96),
      new THREE.MeshStandardMaterial({
        color: "#2a090c",
        metalness: 0.48,
        roughness: 0.3,
      }),
    );
    bowl.position.y = 0.28;
    wheel.add(bowl);

    const pocketAngle = (Math.PI * 2) / WHEEL_ORDER.length;
    WHEEL_ORDER.forEach((number, index) => {
      const angle = index * pocketAngle;
      const pocket = new THREE.Mesh(
        new THREE.BoxGeometry(0.43, 0.13, 0.78),
        new THREE.MeshStandardMaterial({
          color:
            number === 0 ? "#0b7743" : RED.has(number) ? "#a91525" : "#121217",
          metalness: 0.15,
          roughness: 0.42,
        }),
      );
      pocket.position.set(Math.sin(angle) * 2.66, 0.49, Math.cos(angle) * 2.66);
      pocket.rotation.y = angle;
      pocket.castShadow = true;
      wheel.add(pocket);

      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: createNumberTexture(number),
          transparent: true,
        }),
      );
      label.position.set(Math.sin(angle) * 2.63, 0.65, Math.cos(angle) * 2.63);
      label.scale.set(0.37, 0.37, 0.37);
      wheel.add(label);
    });

    const spindle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.58, 1.25, 32),
      new THREE.MeshStandardMaterial({
        color: "#d7a937",
        metalness: 0.95,
        roughness: 0.16,
      }),
    );
    spindle.position.y = 0.78;
    spindle.castShadow = true;
    wheel.add(spindle);

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 24, 24),
      new THREE.MeshStandardMaterial({
        color: "#fffdf4",
        metalness: 0.2,
        roughness: 0.12,
      }),
    );
    ball.castShadow = true;
    scene.add(ball);

    let animationFrame = 0;
    let startTime = performance.now();
    let completed = false;
    const duration = 6_600;

    function resize() {
      if (!mount) return;
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    function frame(now: number) {
      const elapsed = now - startTime;
      const progress =
        spinning && resultNumber !== null ? Math.min(1, elapsed / duration) : 0;
      const eased = 1 - Math.pow(1 - progress, 4);
      wheel.rotation.y = spinning
        ? elapsed * 0.006 * (1 - eased * 0.86)
        : elapsed * 0.00018;

      const targetIndex = Math.max(0, WHEEL_ORDER.indexOf(resultNumber ?? 0));
      const targetAngle = targetIndex * pocketAngle + wheel.rotation.y;
      const orbitAngle = spinning
        ? targetAngle + (1 - eased) * Math.PI * 15
        : elapsed * 0.001;
      const radius = spinning ? 3.45 - eased * 0.82 : 3.42;
      ball.position.set(
        Math.sin(orbitAngle) * radius,
        spinning
          ? 0.66 + Math.sin(progress * Math.PI * 15) * 0.07 * (1 - eased)
          : 0.72,
        Math.cos(orbitAngle) * radius,
      );

      renderer.render(scene, camera);
      if (progress >= 1 && !completed) {
        completed = true;
        onCompleteRef.current?.();
      }
      animationFrame = requestAnimationFrame(frame);
    }
    animationFrame = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          object.geometry?.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => {
            if ("map" in material && material.map instanceof THREE.Texture)
              material.map.dispose();
            material.dispose();
          });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [resultNumber, spinning]);

  return (
    <div
      ref={mountRef}
      className="h-full min-h-[340px] w-full sm:min-h-[470px]"
      aria-label="3Dルーレット演出"
    />
  );
}
