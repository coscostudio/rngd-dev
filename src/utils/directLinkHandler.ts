import { autoplayStateManager } from './browserAutoplayUtils';
import { clearEventFromURL, getEventParams, isValidEventId, setEventInURL } from './urlParams';

/**
 * Handle direct linking to accordion items
 */
export class DirectLinkHandler {
  private static instance: DirectLinkHandler;
  private targetEventId: string | null = null;
  private hasDirectLink: boolean = false;
  private accordionOpened: boolean = false;

  private constructor() {
    const params = getEventParams();
    if (params.event && isValidEventId(params.event)) {
      this.targetEventId = params.event;
      this.hasDirectLink = true;
    }
  }

  public static getInstance(): DirectLinkHandler {
    if (!DirectLinkHandler.instance) {
      DirectLinkHandler.instance = new DirectLinkHandler();
    }
    return DirectLinkHandler.instance;
  }

  /**
   * Check if there's a valid direct link
   */
  public hasValidDirectLink(): boolean {
    return this.hasDirectLink;
  }

  /**
   * Get the target event ID
   */
  public getTargetEventId(): string | null {
    return this.targetEventId;
  }

  /**
   * Should use modified preloader sequence for direct links (logo only, no video)
   */
  public shouldUseModifiedPreloader(): boolean {
    return this.hasDirectLink;
  }

  /**
   * Should skip preloader entirely (keeping for backward compatibility, now returns false)
   */
  public shouldSkipPreloader(): boolean {
    return false; // We now use modified preloader instead of skipping
  }

  /**
   * Check if accordion has already been opened
   */
  public hasOpenedAccordion(): boolean {
    return this.accordionOpened;
  }

  /**
   * Open the target accordion with coordinated preloader transition
   */
  public async openTargetAccordion(coordinateWithPreloader: boolean = false): Promise<void> {
    if (!this.targetEventId || this.accordionOpened) return;

    // Refresh autoplay detection to make sure we have the latest state
    autoplayStateManager.refreshDirectLinkDetection();

    // Wait for DOM to be ready
    await this.waitForDOM();

    // Find the accordion item
    const accordionItem = document.getElementById(this.targetEventId);
    if (!accordionItem || !accordionItem.classList.contains('js-accordion-item')) {
      return;
    }

    // Wait a bit more to ensure all scripts are loaded
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Check if accordion functionality is available
    if (!this.isAccordionReady()) {
      // Retry after a longer delay
      setTimeout(() => {
        this.openTargetAccordion(coordinateWithPreloader);
      }, 1000);
      return;
    }

    // Mark as opened to prevent multiple attempts
    this.accordionOpened = true;

    // Mark user interaction for autoplay management
    // Note: We're NOT marking interaction here because we want the first video
    // to potentially start muted on Safari. The actual click will mark interaction.

    if (coordinateWithPreloader) {
      // Coordinated sequence with preloader slide-up
      this.executeCoordinatedSequence(accordionItem);
    } else {
      // Standard opening (for non-preloader contexts)
      this.executeStandardOpening(accordionItem);
    }
  }

  /**
   * Execute coordinated sequence with preloader slide-up
   */
  private executeCoordinatedSequence(accordionItem: HTMLElement): void {
    // Get accordion position for smooth transition
    const accordionRect = accordionItem.getBoundingClientRect();
    const scrollTarget = window.pageYOffset + accordionRect.top;

    // Store reference for preloader coordination
    (window as any).__directLinkScrollTarget = scrollTarget;
    (window as any).__directLinkAccordionItem = accordionItem;

    // The actual accordion opening will be triggered by the preloader
    // when it completes its slide-up animation
  }

  /**
   * Execute standard accordion opening
   */
  private executeStandardOpening(accordionItem: HTMLElement): void {
    // Scroll to the accordion item first
    accordionItem.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    // Wait for scroll to complete then trigger click
    setTimeout(() => {
      // Trigger a programmatic click that won't mark user interaction
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        // Don't set clientX/Y for programmatic clicks
      });

      // Mark this as a programmatic click
      (clickEvent as any).isProgrammatic = true;

      accordionItem.dispatchEvent(clickEvent);
    }, 500);
  }

  /**
   * Check if accordion functionality is ready
   */
  private isAccordionReady(): boolean {
    // Check if accordion items have click handlers
    const accordionItems = document.querySelectorAll('.js-accordion-item');
    if (accordionItems.length === 0) return false;

    // Check if jQuery and accordion scripts are loaded
    if (typeof window.$ === 'undefined') return false;

    // Check if the accordion items have been initialized
    // (This is a heuristic - in practice the accordion should be ready if DOM is ready and scripts loaded)
    return true;
  }

  /**
   * Wait for DOM and accordion items to be ready
   */
  private waitForDOM(): Promise<void> {
    return new Promise((resolve) => {
      const checkReady = () => {
        if (
          document.readyState === 'complete' &&
          document.querySelectorAll('.js-accordion-item').length > 0
        ) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };

      // If already ready, resolve immediately
      if (
        document.readyState === 'complete' &&
        document.querySelectorAll('.js-accordion-item').length > 0
      ) {
        resolve();
      } else {
        checkReady();
      }
    });
  }

  /**
   * Set URL slug when accordion opens (for social sharing)
   */
  public static setAccordionSlug(accordionId: string): void {
    if (isValidEventId(accordionId)) {
      setEventInURL(accordionId);
    }
  }

  /**
   * Clear URL slug when accordion closes (cleanup for navigation)
   */
  public static clearAccordionSlug(): void {
    clearEventFromURL();
  }

  /**
   * Complete the coordinated opening sequence (called by preloader)
   */
  public completeCoordinatedOpening(): void {
    const accordionItem = (window as any).__directLinkAccordionItem;
    if (accordionItem) {
      // Trigger a programmatic click
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      });

      // Mark this as a programmatic click
      (clickEvent as any).isProgrammatic = true;

      accordionItem.dispatchEvent(clickEvent);

      // Clean up global references
      delete (window as any).__directLinkScrollTarget;
      delete (window as any).__directLinkAccordionItem;
    }
  }

  /**
   * Reset the handler (useful for navigation)
   */
  public reset(): void {
    this.accordionOpened = false;
    // Reset autoplay state manager when navigating
    autoplayStateManager.reset();
    // Don't reset the target - it should persist for the session
  }
}

export const directLinkHandler = DirectLinkHandler.getInstance();
