import { gsap } from 'gsap';

import { WebGLGrid } from './WebGLGrid';

export class ArchiveView {
  private container: HTMLElement;
  private scene: WebGLGrid | null = null;
  private images: any[] = [];
  public isTransitioning = false;
  private isDestroyed = false;
  private rafId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private zoomUI: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private boundHandleResize: () => void;
  private introDelayed = false;
  private introTimer: any = null;

  constructor(container: HTMLElement, delayIntro = false) {
    this.container = container;
    this.introDelayed = delayIntro;

    // Find all images from CMS for use in grid
    const imageElements = Array.from(container.querySelectorAll('.cms-image'));

    // Always use all images, regardless of device
    this.images = imageElements.map((img) => {
      const imgEl = img as HTMLImageElement;
      return {
        file: {
          url: imgEl.src,
          details: {
            image: {
              width: imgEl.naturalWidth || 800,
              height: imgEl.naturalHeight || 1200,
            },
          },
          contentType: 'image/jpeg',
          color: '#0F0F0F', // Keep consistent with site background
        },
      };
    });

    this.boundHandleResize = this.handleResize.bind(this);
    this.setupDOM();
  }

  public triggerIntroSequence(): void {
    if (!this.scene || this.isDestroyed) return;

    if (this.scene.isIntroShown) {
      return;
    }

    if (this.introTimer) {
      clearTimeout(this.introTimer);
      this.introTimer = null;
    }

    // Make loader background transparent to make grid visible
    const gridLoaderOverlay = document.querySelector('.grid-loader-overlay');
    if (gridLoaderOverlay) {
      gridLoaderOverlay.style.backgroundColor = 'transparent';

      const loader = gridLoaderOverlay.querySelector('.grid-loader');
      if (loader && loader.classList.contains('is-loading')) {
        gsap.to(loader, {
          opacity: 0.5,
          duration: 0.25,
          ease: 'power2.out',
        });
      }
    }

    this.scene.startIntroSequence();
    this.show();
  }

  private setupDOM(): void {
    // Create a dedicated container for the archive grid
    const archiveContainer = document.createElement('div');
    archiveContainer.className = 'archive-container';
    archiveContainer.id = 'archive-container';
    archiveContainer.style.position = 'fixed';
    archiveContainer.style.top = '0';
    archiveContainer.style.left = '0';
    archiveContainer.style.width = '100vw';
    archiveContainer.style.height = '100vh';
    archiveContainer.style.backgroundColor = '#0F0F0F'; // Match site background
    archiveContainer.style.zIndex = '10';
    archiveContainer.style.overflow = 'hidden';

    // Create canvas with id 'c'
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'c';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.backgroundColor = '#0F0F0F'; // Match site background
    archiveContainer.appendChild(this.canvas);

    // Create zoom UI
    this.zoomUI = document.createElement('div');
    this.zoomUI.className = 'archiveZoomUI';
    this.zoomUI.style.position = 'fixed';
    this.zoomUI.style.zIndex = '999';
    this.zoomUI.style.display = 'flex';
    this.zoomUI.style.bottom = '2rem';
    this.zoomUI.style.left = '50%';
    this.zoomUI.style.transform = 'translateX(-50%)';
    this.zoomUI.style.opacity = '0';
    this.zoomUI.style.transition = 'opacity 0.3s ease';

    // Create zoom out button
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'archiveZoomUI__button';
    zoomOutBtn.setAttribute('data-action', 'zoom-out');
    zoomOutBtn.style.width = '40px';
    zoomOutBtn.style.height = '40px';
    zoomOutBtn.style.padding = '10px';
    zoomOutBtn.style.backgroundColor = '#424242';
    zoomOutBtn.style.border = 'none';
    zoomOutBtn.style.cursor = 'pointer';
    zoomOutBtn.style.display = 'flex';
    zoomOutBtn.style.alignItems = 'center';
    zoomOutBtn.style.justifyContent = 'center';
    zoomOutBtn.style.color = 'white';
    zoomOutBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="2" viewBox="0 0 18 2" fill="none">
  <path d="M1.43994 1H16.5599" stroke="#F3F2F0" stroke-width="1.62" stroke-linecap="square" stroke-linejoin="round"/>
</svg>
    `;

    // Create zoom in button
    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'archiveZoomUI__button';
    zoomInBtn.setAttribute('data-action', 'zoom-in');
    zoomInBtn.style.width = '40px';
    zoomInBtn.style.height = '40px';
    zoomInBtn.style.padding = '10px';
    zoomInBtn.style.backgroundColor = '#424242';
    zoomInBtn.style.border = 'none';
    zoomInBtn.style.cursor = 'pointer';
    zoomInBtn.style.display = 'flex';
    zoomInBtn.style.alignItems = 'center';
    zoomInBtn.style.justifyContent = 'center';
    zoomInBtn.style.color = 'white';
    zoomInBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
  <path d="M8.99994 1.43945V16.5595M1.43994 8.99945H16.5599" stroke="#F3F2F0" stroke-width="1.62" stroke-linecap="square" stroke-linejoin="round"/>
</svg>
    `;

    this.zoomUI.appendChild(zoomOutBtn);
    this.zoomUI.appendChild(zoomInBtn);

    // Add event listeners for zoom buttons
    zoomOutBtn.addEventListener('click', () => {
      if (this.scene?.isIntroShown) {
        this.scene.zoom('zoom-out');
      }
    });

    zoomInBtn.addEventListener('click', () => {
      if (this.scene?.isIntroShown) {
        this.scene.zoom('zoom-in');
      }
    });

    this.container.appendChild(this.zoomUI);
    this.container.appendChild(archiveContainer);
    this.setupResizeObserver(archiveContainer);
  }

  private setupResizeObserver(container: HTMLElement): void {
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === container && this.scene) {
            this.scene.setWindow();
          }
        }
      });
      this.resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', this.boundHandleResize);
    }
  }

  private handleResize = (): void => {
    if (this.scene) {
      this.scene.setWindow();
    }
  };

  public async init(): Promise<void> {
    try {
      this.isTransitioning = true;

      if (!this.canvas) {
        this.canvas = document.getElementById('c') as HTMLCanvasElement;
        if (!this.canvas) {
          throw new Error('Canvas not found');
        }
      }

      const isMobile = this.isMobileViewport();

      // Create WebGL grid with the introDelayed flag
      this.scene = new WebGLGrid(this.canvas, this.images, isMobile, this.introDelayed);

      // Register callback for when intro is mostly done
      this.scene.onIntroMostlyDone = () => {
        this.showZoomUI();
      };

      this.startRenderLoop();
      this.isTransitioning = false;
    } catch (error) {
      this.isTransitioning = false;
      throw error;
    }
  }

  private isMobileViewport(): boolean {
    return window.innerWidth <= 960;
  }

  private startRenderLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    const update = () => {
      if (this.isDestroyed) return;

      if (this.scene) {
        this.scene.render();
      }
      this.rafId = requestAnimationFrame(update);
    };

    this.rafId = requestAnimationFrame(update);
  }

  public show(): void {
    if (!this.scene) {
      return;
    }

    const archiveContainer = document.getElementById('archive-container');
    if (archiveContainer) {
      gsap.to(archiveContainer, {
        autoAlpha: 1,
        duration: 0.5,
        ease: 'power2.inOut',
      });
    }

    // Make loader background transparent immediately
    const gridLoaderOverlay = document.querySelector('.grid-loader-overlay');
    if (gridLoaderOverlay) {
      gridLoaderOverlay.style.backgroundColor = 'transparent';

      gsap.to(gridLoaderOverlay, {
        opacity: 0,
        delay: 1.5,
        duration: 1.2,
        ease: 'power2.inOut',
        onComplete: () => {
          if (gridLoaderOverlay.parentNode) {
            gridLoaderOverlay.parentNode.removeChild(gridLoaderOverlay);
          }
        },
      });
    }
  }

  public showZoomUI(): void {
    if (this.zoomUI) {
      gsap.to(this.zoomUI, {
        opacity: 1,
        duration: 0.75,
        ease: 'power2.inOut',
      });
    }

    // Force-remove any loader that might still be visible
    const gridLoaderOverlay = document.querySelector('.grid-loader-overlay');
    if (gridLoaderOverlay && gridLoaderOverlay.parentNode) {
      gridLoaderOverlay.parentNode.removeChild(gridLoaderOverlay);
    }
  }

  public async fadeOut(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.isTransitioning = true;

      const duration = 0.8;
      const ease = 'power2.inOut';

      const archiveContainer = document.getElementById('archive-container');
      if (archiveContainer) {
        gsap.to(archiveContainer, {
          opacity: 0,
          duration: duration,
          ease: ease,
          onComplete: () => {
            this.isTransitioning = false;
            resolve();
          },
        });
      } else {
        this.isTransitioning = false;
        resolve();
      }

      if (this.zoomUI) {
        gsap.to(this.zoomUI, {
          opacity: 0,
          duration: duration,
          ease: ease,
        });
      }

      if (this.scene) {
        try {
          gsap.to(this.scene, {
            grayscale: 1,
            duration: duration,
            ease: ease,
            onUpdate: () => {
              this.scene?.render();
            },
          });
        } catch (e) {}
      }
    });
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    } else {
      window.removeEventListener('resize', this.boundHandleResize);
    }

    if (this.introTimer) {
      clearTimeout(this.introTimer);
      this.introTimer = null;
    }

    setTimeout(() => {
      if (this.scene) {
        try {
          this.scene.destroy();
          this.scene = null;
        } catch (e) {}
      }

      setTimeout(() => {
        try {
          const archiveContainer = document.getElementById('archive-container');
          if (archiveContainer) {
            archiveContainer.remove();
          }

          if (this.zoomUI) {
            this.zoomUI.remove();
            this.zoomUI = null;
          }

          this.canvas = null;
          this.images = [];
        } catch (e) {}
      }, 300);
    }, 800);
  }
}
