import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { appVersion } from '../environments/version';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <header class="page-header">
      <div class="container header-content">
        <a routerLink="/" class="brand">
          <img class="logo" src="logo.svg" alt="ApiShift" />
          <span class="brand-name">ApiShift</span>
        </a>
        <nav>
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}">Dashboard</a>
          <a routerLink="/threescale" routerLinkActive="active">3scale Explorer</a>
          <a routerLink="/migrate" routerLinkActive="active">Migration</a>
          <a routerLink="/chat" routerLinkActive="active">AI Chat</a>
          <a routerLink="/audit" routerLinkActive="active">Audit Log</a>
          <a routerLink="/settings" routerLinkActive="active">Settings</a>
        </nav>
      </div>
    </header>

    <main>
      <router-outlet></router-outlet>
    </main>

    <footer class="site-footer">
      <div class="container">
        <div class="footer-content">
          <div class="footer-links">
            <a href="https://docs.redhat.com/en/documentation/red_hat_connectivity_link" target="_blank">Connectivity Link</a>
            <a href="https://docs.kuadrant.io/" target="_blank">Kuadrant</a>
            <a href="https://github.com/Kuadrant/kuadrantctl" target="_blank">kuadrantctl</a>
            <a href="https://docs.redhat.com/en/documentation/red_hat_3scale_api_management" target="_blank">3scale Docs</a>
            <a href="https://gateway-api.sigs.k8s.io/" target="_blank">Gateway API</a>
            <a href="https://everything-is-code.github.io/apishift/" target="_blank">ApiShift Docs</a>
            <a href="https://github.com/Everything-is-Code/apishift" target="_blank">GitHub</a>
          </div>
          <p class="copyright">ApiShift v{{ version }} &copy; 2026 Maximiliano Pizarro &mdash; Apache 2.0 License</p>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .page-header {
      background: #151515; color: white; position: sticky; top: 0; z-index: 100;
      border-bottom: 2px solid #ee0000;
    }
    .header-content {
      display: flex; align-items: center; gap: 0; padding: 0 24px;
      max-width: 1280px; margin: 0 auto; height: 52px;
    }
    .brand {
      display: flex; align-items: center; gap: 10px; text-decoration: none;
      color: white; margin-right: 32px; flex-shrink: 0;
    }
    .brand:hover { text-decoration: none; }
    .logo { height: 32px; width: auto; display: block; }
    .brand-name {
      font-family: 'Red Hat Display', sans-serif;
      font-size: 1.15rem; font-weight: 600; letter-spacing: 0.5px;
    }
    nav { display: flex; gap: 2px; }
    nav a {
      color: #a0a0a0; text-decoration: none; padding: 14px 16px;
      font-size: 0.88rem; font-weight: 500; transition: all 0.15s;
      border-bottom: 2px solid transparent; margin-bottom: -2px;
    }
    nav a:hover { color: white; text-decoration: none; }
    nav a.active { color: white; border-bottom-color: #ee0000; }

    main { min-height: calc(100vh - 52px - 100px); }

    .site-footer {
      background: #151515; color: #c9c9c9; padding: 28px 0;
      border-top: 1px solid #333;
    }
    .footer-content { text-align: center; }
    .footer-links {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; margin-bottom: 14px;
    }
    .footer-links a { color: #73bcf7; font-size: 0.85rem; text-decoration: none; }
    .footer-links a:hover { color: #a8d4ff; text-decoration: underline; }
    .copyright { font-size: 0.78rem; color: #6a6e73; }

    @media (max-width: 768px) {
      .header-content { flex-wrap: wrap; height: auto; padding: 12px 16px; }
      .brand { margin-right: auto; }
      nav { width: 100%; overflow-x: auto; padding-top: 4px; }
      nav a { padding: 8px 12px; font-size: 0.82rem; white-space: nowrap; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class AppComponent {
  readonly version = appVersion;
}
