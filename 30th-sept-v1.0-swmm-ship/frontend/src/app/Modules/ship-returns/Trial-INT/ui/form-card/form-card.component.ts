import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApprovalWorkFlow } from '../approval-work-flow/approval-work-flow';
import { FormApiService } from '../../angulerFromconverting/form-api.service';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-form-card',
  standalone: true,
  host: {
    class: 'flex flex-col',
    '[class.h-full]': '!pageScroll',
    '[class.min-h-0]': '!pageScroll',
    '[class.max-h-full]': '!pageScroll',
    '[class.flex-1]': '!pageScroll',
  },
  imports: [CommonModule, ApprovalWorkFlow, IconComponent],
  templateUrl: './form-card.component.html',
  styleUrl: './form-card.component.css',
})
export class FormCardComponent {
  @Input() title!: string;
  @Input() smallTitle!: string;
  @Input() previewMode = false;

  @Input() showPreviousReport = false;
  /** When false, hides the top action bar (Previous Report / User Action / Trial Types). */
  @Input() showTopBar = true;
  @Input() showFormFooter = true;
  @Input() previousReportLabel = 'Previous Report';
  @Input() showSecondaryAction = false;
  @Input() secondaryActionLabel = 'Trial Pass';

  @Input() showBackButton = false;
  @Input() backLabel = 'Back';

  /** When true, content grows with the page instead of scrolling inside a capped panel. */
  @Input() pageScroll = true;

  @Input() showPaginator = false;
  @Input() currentPage = 1;
  @Input() totalPages = 1;

  @Output() previousReport = new EventEmitter<void>();
  @Output() action = new EventEmitter<void>();
  @Output() secondaryAction = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();
  @Output() paginator = new EventEmitter<number>();
  @Output() firstPage = new EventEmitter<void>();
  @Output() prevPage = new EventEmitter<void>();
  @Output() nextPage = new EventEmitter<void>();
  @Output() lastPage = new EventEmitter<void>();

  isSubmitTimes = false;
  istrialTypesOpen = false;
  shouldShowUserPopup = false;
  showTrialPassLayout = false;
  context: any = {};

  constructor(
    private api: FormApiService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    this.context = this.api.context;
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  get formContext(): any {
    return this.api.context || {};
  }

  get canShowAddTrialPass(): boolean {
    return this.formContext?.workflow_rights?.can_generate_trial_pass === true;
  }

  get canShowTrialTypes(): boolean {
    const rights = this.formContext?.workflow_rights ?? this.context?.workflow_rights;
    const canAcceptTrial = rights?.can_accept_trial === true;
    const canAcceptReq = rights?.can_accept_req === true;
    const visible = canAcceptTrial || canAcceptReq;

    if (visible && !this.trialTypesVisibilityLogged) {
      console.log(
        '[FormCard] Trial Types button visible — can_accept_trial or can_accept_req is true',
        { can_accept_trial: canAcceptTrial, can_accept_req: canAcceptReq, workflow_rights: rights },
      );
      this.trialTypesVisibilityLogged = true;
    }

    return visible;
  }

  private trialTypesVisibilityLogged = false;

  onTrialPassDialogChange(open: boolean): void {
    this.context = this.api.context;
    this.showTrialPassLayout = open;
  }

  onPreviousReport(): void {
    this.previousReport.emit();
    this.navigateToHituReport();
  }

  private navigateToHituReport(): void {
    const path = this.router.url.split('?')[0] || '';
    const match = path.match(/\/hitu\/([^/]+)$/i);
    if (!match) return;

    const segment = match[1];
    if (segment.toLowerCase() === 'report' || segment.toLowerCase() === 'dashboard') return;

    this.router.navigate(['/afterAuth/ship-returns/trials/hitu', 'report', segment], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  onAction(): void {
    this.context = this.api.context;
    this.shouldShowUserPopup = true;
    this.action.emit();
  }

  onBack(): void {
    this.back.emit();
    const currentUrl = this.router.url.split('?')[0];

    if (currentUrl.endsWith('-add')) {
      const parentUrl = currentUrl.replace(/-add$/, '');
      this.router.navigateByUrl(parentUrl);
    } else if (currentUrl.includes('/edit') || currentUrl.includes('/view-details')) {
      const parentUrl = currentUrl.replace(/\/(edit|view-details|\d+)+.*$/, '');
      this.router.navigateByUrl(parentUrl);
    } else {
      window.history.back();
    }
  }

  onTrialTypes(): void {
    this.context = this.api.context;
    this.istrialTypesOpen = true;
  }

  onSecondaryAction(): void {
    this.secondaryAction.emit();
  }

  onPageClick(page: number): void {
    if (page === this.currentPage) return;
    this.paginator.emit(page);
  }

  onFirstPage(): void {
    if (this.currentPage > 1) this.firstPage.emit();
  }

  onPrevPage(): void {
    if (this.currentPage > 1) this.prevPage.emit();
  }

  onNextPage(): void {
    if (this.currentPage < this.totalPages) this.nextPage.emit();
  }

  onLastPage(): void {
    if (this.currentPage < this.totalPages) this.lastPage.emit();
  }
}
