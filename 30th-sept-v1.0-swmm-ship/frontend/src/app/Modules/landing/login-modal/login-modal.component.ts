import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, EventEmitter, HostListener, inject, Input, Output, ChangeDetectionStrategy, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { resolveCmmsApiUrl, resolveAuthApiUrl } from '../../../../environments/api-url';
import { BaseModalComponent } from '../../../shared/components/modal/base-modal.component';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Auth, AppService, NotificationService, ThemeService, User } from '../../../Core';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { LandingPageService } from '../services/landing-page.service';
import { UserManagementApiResponse } from '../../administration/user-list/user-list.component';
import { ThisShipService } from '../../../Core/services/ship/this-ship.service';

function notBlankValidator(minLength: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const trimmed = (control.value ?? '').toString().trim();
    if (trimmed.length === 0) {
      return { required: true };
    }
    if (trimmed.length < minLength) {
      return { minlength: { requiredLength: minLength, actualLength: trimmed.length } };
    }
    return null;
  };
}

@Component({
  selector: 'app-login-modal',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent, ButtonComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './login-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./login-modal.component.scss']
})
export class LoginModalComponent extends BaseModalComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(Auth);
  private readonly appService = inject(AppService);
  private readonly notification = inject(NotificationService);
  private readonly elRef = inject(ElementRef);
  private readonly themeService = inject(ThemeService);
  private readonly landingService = inject(LandingPageService);
  private readonly userService = inject(User);
  // Developed with Understanding: this ship's display name for the popup subtitle. The landing
  // page has already called load(), so the popup only reads the signal.
  readonly thisShip = inject(ThisShipService);

  readonly showPassword = signal(false);
  readonly showForgotInfo = signal(false);
  readonly loginError = signal<string | null>(null);
  loginForm: FormGroup;

  @Input() shipData?: { name?: string;[key: string]: unknown };
  @Output() switchToSignup = new EventEmitter<void>();

  constructor() {
    super();
    this.loginForm = this.fb.nonNullable.group({
      username: ['', [notBlankValidator(2)]],
      password: ['', [notBlankValidator(4)]]
    });
    this.loginForm.valueChanges.subscribe(() => this.loginError.set(null));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showForgotInfo() && !this.elRef.nativeElement.contains(event.target)) {
      this.showForgotInfo.set(false);
    }
  }

  get f() {
    return this.loginForm.controls;
  }


  async onLogin(): Promise<void> {
    this.loginError.set(null);

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.appService.showLoader();
    try {
      const raw = this.loginForm.getRawValue();
      const credentials = { username: raw.username.trim(), password: raw.password };
      const res = await this.authService.loginUser(credentials);
      if (res.success) {
        // Fetch logged in user details to populate role and access control signals
        try {
          await this.userService.getLoggedInUserDetails();
        } catch (error) {
          console.error("Failed to fetch user details during login", error);
        }

        // Force dark mode on login
        this.themeService.setTheme('dark');
        this.authService.secondaryLoginForITTTM(this.loginForm.getRawValue());

        const redirectPath = await this.resolveRedirectPath(this.isAdminUser());

        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        if (returnUrl) {
          this.router.navigateByUrl(returnUrl);
        } else {
          this.router.navigate([redirectPath]);
        }
        this.onClose();
      } else {
        const rawMessage = res.message as unknown;
        const message = Array.isArray(rawMessage) ? rawMessage.join(' ') : rawMessage as string;
        this.loginError.set(message);
        this.notification.warning(message);
      }
    } catch (error) {
      console.error('Login failed', error);
      this.loginError.set('Something went wrong while logging in. Please try again.');
      this.notification.warning('Incorrect username or password.');
    } finally {
      await this.appService.hideLoader();
    }
  }

  // Developed with Understanding: moved out of onLogin unchanged, so that method stays under the
  // lint complexity limit - whether the signed-in user is an administrator.
  private isAdminUser(): boolean {
    const user = (this.userService.userDetails() || this.landingService.user()) as Record<string, unknown> | null;
    return Boolean(
      user?.['is_admin'] === true ||
      user?.['is_staff'] === true ||
      user?.['is_superuser'] === true ||
      user?.['role'] === 'SHIPADMIN' ||
      user?.['role'] === 'ADMIN'
    );
  }

  // Developed with Understanding: moved out of onLogin unchanged - reads the pending role
  // requests, stores their count, and picks where to go after login.
  private async resolveRedirectPath(isAdmin: boolean): Promise<string> {
    let redirectPath = 'afterAuth/home';
    try {
      const authUrl = resolveAuthApiUrl() || resolveCmmsApiUrl();
      const usersRes = await firstValueFrom(
        this.http.get<UserManagementApiResponse>(
          `${authUrl}api/v1/auth/users/`
        )
      );
      const count = usersRes?.pending_requests?.length ?? 0
      this.userService.pendingRoleRequestsCount.set(count)

      if (isAdmin) {
        redirectPath = count > 0
          ? 'afterAuth/Administration/user-list'
          : 'afterAuth/Administration/nav-visibility';
      }
    } catch (err) {
      console.warn('Failed to fetch pending requests, defaulting to nav-visibility', err);
      redirectPath = 'afterAuth/Administration/nav-visibility';
    }
    return redirectPath;
  }

  onSwitchToSignup(): void {
    this.switchToSignup.emit();
  }
}

