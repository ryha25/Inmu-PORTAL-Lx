import { useEffect, useRef } from "react";
import * as THREE from "three";

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

type RouletteWheel3DProps = {
  resultNumber: number | null;
  spinning: boolean;
  dealerImage?: string;
  dealerName?: string;
  won?: boolean;
  onAnimationComplete?: () => void;
};

function createTextTexture(
  text: string,
  options: { width?: number; height?: number; fontSize?: number } = {},
) {
  const width = options.width ?? 512;
  const height = options.height ?? 160;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#7c4a12");
  gradient.addColorStop(0.5, "#f8d675");
  gradient.addColorStop(1, "#7c4a12");
  context.strokeStyle = gradient;
  context.lineWidth = 5;
  context.roundRect(5, 5, width - 10, height - 10, 24);
  context.stroke();
  context.fillStyle = "rgba(20, 6, 8, .88)";
  context.roundRect(10, 10, width - 20, height - 20, 20);
  context.fill();
  context.fillStyle = "#fff0b0";
  context.font = `700 ${options.fontSize ?? 48}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

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

function addCasinoRoom(scene: THREE.Scene) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({
      color: "#52121d",
      roughness: 0.52,
      metalness: 0.08,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.02;
  floor.receiveShadow = true;
  scene.add(floor);

  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(9.5, 24),
    new THREE.MeshStandardMaterial({
      color: "#7e1021",
      roughness: 0.68,
      metalness: 0,
    }),
  );
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, -0.99, 1);
  carpet.receiveShadow = true;
  scene.add(carpet);

  [-4.65, 4.65].forEach((x) => {
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.03, 24),
      new THREE.MeshStandardMaterial({
        color: "#d5a83c",
        metalness: 0.88,
        roughness: 0.22,
      }),
    );
    trim.position.set(x, -0.94, 1);
    scene.add(trim);
  });

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(22, 9.5, 0.5),
    new THREE.MeshStandardMaterial({
      color: "#321318",
      roughness: 0.38,
      metalness: 0.16,
    }),
  );
  backWall.position.set(0, 3.45, -8.2);
  backWall.receiveShadow = true;
  scene.add(backWall);

  const woodPanelMaterial = new THREE.MeshStandardMaterial({
    color: "#4b2219",
    roughness: 0.42,
    metalness: 0.18,
  });
  for (let x = -8; x <= 8; x += 2) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.72, 4.8, 0.18),
      woodPanelMaterial,
    );
    panel.position.set(x, 2.2, -7.88);
    scene.add(panel);
    const panelTrim = new THREE.Mesh(
      new THREE.BoxGeometry(1.82, 0.07, 0.23),
      new THREE.MeshStandardMaterial({
        color: "#bf8b2e",
        metalness: 0.82,
        roughness: 0.25,
      }),
    );
    panelTrim.position.set(x, 4.48, -7.75);
    scene.add(panelTrim);
  }

  const columnMaterial = new THREE.MeshStandardMaterial({
    color: "#dbc28a",
    roughness: 0.24,
    metalness: 0.26,
  });
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: "#d5a83c",
    metalness: 0.9,
    roughness: 0.18,
  });
  [-6.35, 6.35].forEach((x) => {
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.62, 7.2, 32),
      columnMaterial,
    );
    column.position.set(x, 2.55, -7.35);
    column.castShadow = true;
    scene.add(column);
    [-0.98, 6.08].forEach((y) => {
      const capital = new THREE.Mesh(
        new THREE.CylinderGeometry(0.78, 0.78, 0.24, 32),
        goldMaterial,
      );
      capital.position.set(x, y, -7.35);
      scene.add(capital);
    });
  });

  const chandelier = new THREE.Group();
  chandelier.position.set(0, 6.7, -1.5);
  const chandelierRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.45, 0.08, 16, 64),
    goldMaterial,
  );
  chandelierRing.rotation.x = Math.PI / 2;
  chandelier.add(chandelierRing);
  for (let index = 0; index < 10; index += 1) {
    const angle = (Math.PI * 2 * index) / 10;
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.13, 0),
      new THREE.MeshPhysicalMaterial({
        color: "#ffe8a3",
        emissive: "#ffb52d",
        emissiveIntensity: 1.2,
        transmission: 0.35,
        roughness: 0.08,
      }),
    );
    crystal.position.set(Math.sin(angle) * 1.45, -0.28, Math.cos(angle) * 1.45);
    chandelier.add(crystal);
  }
  scene.add(chandelier);

  const chandelierLight = new THREE.PointLight("#ffc45b", 32, 17, 1.5);
  chandelierLight.position.set(0, 5.8, -1.4);
  scene.add(chandelierLight);

  [-5.1, 5.1].forEach((x) => {
    const distantTable = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 1.9, 0.42, 48),
      new THREE.MeshStandardMaterial({
        color: "#123526",
        roughness: 0.5,
        metalness: 0.12,
      }),
    );
    distantTable.scale.z = 0.58;
    distantTable.position.set(x, -0.35, -4.35);
    distantTable.rotation.y = x > 0 ? -0.28 : 0.28;
    distantTable.receiveShadow = true;
    scene.add(distantTable);
    const distantLight = new THREE.PointLight("#ff9b38", 7, 5);
    distantLight.position.set(x, 2, -4);
    scene.add(distantLight);
  });

  const sign = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createTextTexture("INMU CASINO", { width: 720, fontSize: 62 }),
      transparent: true,
      depthWrite: false,
    }),
  );
  sign.position.set(0, 4.8, -7.55);
  sign.scale.set(5.4, 1.2, 1);
  scene.add(sign);
}

export function RouletteWheel3D({
  resultNumber,
  spinning,
  dealerImage,
  dealerName = "本日のディーラー",
  won = false,
  onAnimationComplete,
}: RouletteWheel3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onAnimationComplete);
  onCompleteRef.current = onAnimationComplete;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let active = true;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#250b10");
    scene.fog = new THREE.FogExp2("#250b10", 0.035);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 4.9, 10.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.replaceChildren(renderer.domElement);

    scene.add(new THREE.HemisphereLight("#ffd994", "#2a0710", 2.15));
    const warmFill = new THREE.DirectionalLight("#ffd181", 4.8);
    warmFill.position.set(-2.5, 8, 6);
    warmFill.castShadow = true;
    warmFill.shadow.mapSize.set(1024, 1024);
    scene.add(warmFill);
    const wheelSpot = new THREE.SpotLight(
      "#ffcc72",
      26,
      22,
      Math.PI / 5,
      0.46,
      1.15,
    );
    wheelSpot.position.set(0, 8, 4);
    wheelSpot.target.position.set(0, 0, 0);
    wheelSpot.castShadow = true;
    scene.add(wheelSpot, wheelSpot.target);
    const redFill = new THREE.PointLight("#d8273c", 13, 12);
    redFill.position.set(-5, 1.5, 1.8);
    scene.add(redFill);
    const dealerLight = new THREE.SpotLight(
      "#ffe3a0",
      18,
      15,
      Math.PI / 4,
      0.58,
      1.2,
    );
    dealerLight.position.set(4.5, 6.5, 1.5);
    dealerLight.target.position.set(3.15, 1.7, -3.1);
    scene.add(dealerLight, dealerLight.target);

    addCasinoRoom(scene);

    const tableGroup = new THREE.Group();
    tableGroup.position.z = 0.3;
    scene.add(tableGroup);
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(4.7, 4.82, 0.68, 96),
      new THREE.MeshStandardMaterial({
        color: "#0f3d2b",
        roughness: 0.46,
        metalness: 0.12,
      }),
    );
    table.scale.z = 0.77;
    table.position.y = -0.53;
    table.receiveShadow = true;
    table.castShadow = true;
    tableGroup.add(table);
    const tableRim = new THREE.Mesh(
      new THREE.TorusGeometry(4.56, 0.17, 20, 96),
      new THREE.MeshStandardMaterial({
        color: "#ac7222",
        metalness: 0.82,
        roughness: 0.22,
      }),
    );
    tableRim.scale.z = 0.77;
    tableRim.rotation.x = Math.PI / 2;
    tableRim.position.y = -0.18;
    tableGroup.add(tableRim);

    const wheel = new THREE.Group();
    wheel.position.y = 0.02;
    tableGroup.add(wheel);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.45, 3.58, 0.44, 96),
      new THREE.MeshStandardMaterial({
        color: "#a66b17",
        metalness: 0.9,
        roughness: 0.18,
      }),
    );
    base.castShadow = true;
    wheel.add(base);
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(2.82, 3.14, 0.29, 96),
      new THREE.MeshStandardMaterial({
        color: "#310a10",
        metalness: 0.5,
        roughness: 0.27,
      }),
    );
    bowl.position.y = 0.3;
    bowl.castShadow = true;
    wheel.add(bowl);

    const pocketAngle = (Math.PI * 2) / WHEEL_ORDER.length;
    WHEEL_ORDER.forEach((number, index) => {
      const angle = index * pocketAngle;
      const pocket = new THREE.Mesh(
        new THREE.BoxGeometry(0.43, 0.13, 0.78),
        new THREE.MeshStandardMaterial({
          color:
            number === 0 ? "#08784a" : RED.has(number) ? "#b0192b" : "#111116",
          metalness: 0.17,
          roughness: 0.38,
        }),
      );
      pocket.position.set(Math.sin(angle) * 2.66, 0.5, Math.cos(angle) * 2.66);
      pocket.rotation.y = angle;
      pocket.castShadow = true;
      wheel.add(pocket);

      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: createNumberTexture(number),
          transparent: true,
          depthWrite: false,
        }),
      );
      label.position.set(Math.sin(angle) * 2.63, 0.67, Math.cos(angle) * 2.63);
      label.scale.set(0.37, 0.37, 0.37);
      wheel.add(label);
    });

    const spindle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.6, 1.3, 32),
      new THREE.MeshStandardMaterial({
        color: "#e2b546",
        metalness: 0.96,
        roughness: 0.14,
      }),
    );
    spindle.position.y = 0.8;
    spindle.castShadow = true;
    wheel.add(spindle);

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 24, 24),
      new THREE.MeshStandardMaterial({
        color: "#fffdf2",
        metalness: 0.22,
        roughness: 0.08,
        emissive: "#fff3c4",
        emissiveIntensity: 0.12,
      }),
    );
    ball.castShadow = true;
    scene.add(ball);

    let dealerSprite: THREE.Sprite | null = null;
    let dealerBaseY = 1.6;
    if (dealerImage) {
      new THREE.TextureLoader().load(
        dealerImage,
        (texture) => {
          if (!active) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: true,
            depthWrite: false,
          });
          dealerSprite = new THREE.Sprite(material);
          dealerSprite.position.set(3.15, dealerBaseY, -3.25);
          dealerSprite.scale.set(3.55, 4.7, 1);
          scene.add(dealerSprite);
        },
        undefined,
        () => undefined,
      );
    }

    const dealerPlate = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createTextTexture(dealerName, { width: 540, fontSize: 45 }),
        transparent: true,
        depthWrite: false,
      }),
    );
    dealerPlate.position.set(3.15, -0.43, -2.95);
    dealerPlate.scale.set(3.15, 0.9, 1);
    scene.add(dealerPlate);

    const confettiGeometry = new THREE.BufferGeometry();
    const confettiCount = 160;
    const confettiPositions = new Float32Array(confettiCount * 3);
    for (let index = 0; index < confettiCount; index += 1) {
      confettiPositions[index * 3] = (Math.random() - 0.5) * 10;
      confettiPositions[index * 3 + 1] = Math.random() * 7;
      confettiPositions[index * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    confettiGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(confettiPositions, 3),
    );
    const confetti = new THREE.Points(
      confettiGeometry,
      new THREE.PointsMaterial({
        color: "#ffd15a",
        size: 0.09,
        transparent: true,
        opacity: 0.95,
      }),
    );
    confetti.visible = false;
    scene.add(confetti);

    const winLight = new THREE.PointLight("#ffd34f", 0, 18);
    winLight.position.set(0, 4.5, 2);
    scene.add(winLight);

    let animationFrame = 0;
    const startTime = performance.now();
    let completed = false;
    const duration = 7_800;
    const targetLook = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    const cameraPosition = new THREE.Vector3();
    const overviewPosition = new THREE.Vector3(0, 4.9, 10.8);
    const dealerClosePosition = new THREE.Vector3(2.8, 3.5, 5.2);
    const wheelPosition = new THREE.Vector3(0, 5.7, 6.7);
    const resultPosition = new THREE.Vector3(0, 3.2, 5.2);

    function resize() {
      const width = mount!.clientWidth;
      const height = mount!.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = camera.aspect < 0.85 ? 51 : 42;
      camera.updateProjectionMatrix();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    function frame(now: number) {
      const elapsed = now - startTime;
      const hasResult = resultNumber !== null;
      const progress =
        spinning && hasResult ? Math.min(1, elapsed / duration) : 0;
      const eased = 1 - Math.pow(1 - progress, 4);
      const idleTime = elapsed * 0.001;
      const settled = hasResult && !spinning;

      wheel.rotation.y =
        spinning && hasResult
          ? elapsed * 0.0058 * (1 - eased * 0.86)
          : settled
            ? 0
            : elapsed * 0.00014;

      const targetIndex = Math.max(0, WHEEL_ORDER.indexOf(resultNumber ?? 0));
      const targetAngle = targetIndex * pocketAngle + wheel.rotation.y;

      if (spinning && hasResult && progress < 0.16) {
        const tossProgress = progress / 0.16;
        ball.position.set(
          3.15 - tossProgress * 0.55,
          2.6 + Math.sin(tossProgress * Math.PI) * 0.65,
          -2.15 + tossProgress * 1.5,
        );
      } else {
        const orbitProgress =
          spinning && hasResult ? Math.max(0, (progress - 0.16) / 0.84) : 0;
        const orbitEase = 1 - Math.pow(1 - orbitProgress, 4);
        const orbitAngle =
          spinning && hasResult
            ? targetAngle + (1 - orbitEase) * Math.PI * 16
            : settled
              ? targetAngle
              : elapsed * 0.0008;
        const radius =
          spinning && hasResult ? 3.48 - orbitEase * 0.84 : settled ? 2.64 : 3.42;
        ball.position.set(
          Math.sin(orbitAngle) * radius,
          spinning && hasResult
            ? 0.68 +
                Math.sin(orbitProgress * Math.PI * 17) *
                  0.08 *
                  (1 - orbitEase)
            : settled
              ? 0.57
              : 0.73,
          Math.cos(orbitAngle) * radius + tableGroup.position.z,
        );
      }

      if (!spinning || !hasResult) {
        cameraPosition.copy(
          settled
            ? resultPosition
            : overviewPosition.clone().add(
                new THREE.Vector3(Math.sin(idleTime * 0.25) * 0.16, 0, 0),
              ),
        );
        cameraTarget.set(0, settled ? 0.4 : 0.7, settled ? 0.3 : -0.2);
      } else if (progress < 0.19) {
        const phase = progress / 0.19;
        cameraPosition.lerpVectors(overviewPosition, dealerClosePosition, phase);
        cameraTarget.lerpVectors(
          new THREE.Vector3(0, 0.7, -0.2),
          new THREE.Vector3(3.05, 1.65, -3.1),
          phase,
        );
      } else if (progress < 0.38) {
        const phase = (progress - 0.19) / 0.19;
        cameraPosition.lerpVectors(dealerClosePosition, wheelPosition, phase);
        cameraTarget.lerpVectors(
          new THREE.Vector3(3.05, 1.65, -3.1),
          new THREE.Vector3(0, 0.4, 0.2),
          phase,
        );
      } else if (progress < 0.86) {
        const phase = (progress - 0.38) / 0.48;
        const orbit = -0.26 + phase * 0.52;
        cameraPosition.set(
          Math.sin(orbit) * 6.7,
          4.9 - phase * 0.9,
          Math.cos(orbit) * 6.7,
        );
        cameraTarget.set(0, 0.38, 0.25);
      } else {
        const phase = (progress - 0.86) / 0.14;
        const current = new THREE.Vector3(
          Math.sin(0.26) * 6.7,
          4,
          Math.cos(0.26) * 6.7,
        );
        cameraPosition.lerpVectors(current, resultPosition, phase);
        const pocketX = Math.sin(targetAngle) * 2.45;
        const pocketZ = Math.cos(targetAngle) * 2.45 + tableGroup.position.z;
        cameraTarget.lerpVectors(
          new THREE.Vector3(0, 0.38, 0.25),
          new THREE.Vector3(pocketX, 0.5, pocketZ),
          phase,
        );
      }
      camera.position.lerp(cameraPosition, 0.1);
      targetLook.lerp(cameraTarget, 0.12);
      camera.lookAt(targetLook);

      if (dealerSprite) {
        const throwing =
          spinning && hasResult && progress > 0.08 && progress < 0.28;
        const reaction =
          hasResult && (settled || (spinning && progress > 0.9));
        dealerSprite.position.y =
          dealerBaseY +
          Math.sin(idleTime * 1.4) * 0.045 +
          (throwing ? Math.sin(((progress - 0.08) / 0.2) * Math.PI) * 0.28 : 0) +
          (reaction && won ? Math.abs(Math.sin(idleTime * 5)) * 0.12 : 0);
        dealerSprite.material.rotation = throwing
          ? -0.12 * Math.sin(((progress - 0.08) / 0.2) * Math.PI)
          : reaction && !won
            ? -0.045
            : Math.sin(idleTime * 0.8) * 0.012;
      }

      const resultVisible =
        hasResult && (settled || (spinning && progress > 0.88));
      confetti.visible = Boolean(resultVisible && won);
      if (confetti.visible) {
        confetti.rotation.y += 0.004;
        confetti.position.y = -((elapsed * 0.00042) % 2.4);
        winLight.intensity = 30 + Math.sin(idleTime * 4) * 5;
        renderer.toneMappingExposure = 1.28;
      } else {
        winLight.intensity = 0;
        renderer.toneMappingExposure =
          resultVisible && !won ? 0.98 : 1.15;
      }

      renderer.render(scene, camera);
      if (progress >= 1 && !completed) {
        completed = true;
        onCompleteRef.current?.();
      }
      animationFrame = requestAnimationFrame(frame);
    }
    animationFrame = requestAnimationFrame(frame);

    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
        }
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Sprite ||
          object instanceof THREE.Points
        ) {
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => {
            if ("map" in material && material.map instanceof THREE.Texture) {
              material.map.dispose();
            }
            material.dispose();
          });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [dealerImage, dealerName, resultNumber, spinning, won]);

  return (
    <div
      ref={mountRef}
      className="h-full min-h-[330px] w-full sm:min-h-[500px]"
      aria-label="高級カジノの3Dルーレット演出"
    />
  );
}
