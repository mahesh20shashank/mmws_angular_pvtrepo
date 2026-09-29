import { ButtonComponent } from '../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, AfterViewInit, inject, signal, ViewChild, ViewChildren, QueryList, ElementRef, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { ColDef } from "ag-grid-community";
import { HomeApi } from "../services/home-api";
import { NotificationService } from "../../../Core/services/notification/notification.service";
import { User } from "../../../Core/services/user/user";
import { ModalComponent } from "../../../shared/components/modal/modal.component";
import { MasterCard } from "../../refit-maintenance/master-card/master-card";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import {
  CreateRegulatorPayload,
  DepartmentRegulators,
  RankOption,
  RegulatorSailor,
  RegulatorSummary,
  SubDepartmentRegulators,
  UpdateRegulatorProfilePayload,
} from "./know-your-regulators.model";
import { DepartmentMaster, SubDepartmentMaster } from "../department-master/department-master.model";
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
const HELP_HTML = `
  <ul class="list-disc pl-4 mb-2 space-y-1">
    <li class="pb-1 leading-relaxed">
      The chart runs 
      <span class="whitespace-nowrap"><strong>Commanding Officer</strong> →</span> 
      <span class="whitespace-nowrap"><strong>Head of Department</strong> →</span> 
      <span class="whitespace-nowrap"><strong>Divisional Officer</strong> →</span> 
      <span class="whitespace-nowrap"><strong>Division</strong> →</span> 
      <span class="whitespace-nowrap"><strong>Sailor.</strong></span> 
      Switch to <strong>Edit Mode</strong> to add or change anything.
    </li>
    <li class="pb-1 leading-relaxed">A Divisional Officer may hold <strong>further Divisional Officers</strong>, up to five officer levels below the HOD card.</li>
    <li class="pb-1 leading-relaxed">An officer's children are <strong>all one kind</strong>. Once a Division exists under an officer, that level offers only <strong>+ Add Division</strong>, so further divisions can still be added there. A <strong>Division is terminal</strong> — it holds sailors only, never another officer.</li>
    <li class="pb-1 leading-relaxed">A Divisional Officer placed <strong>directly under a HOD</strong> may be tagged as the <strong>Departmental Officer</strong> (the Dy HOD billet).</li>
    <li class="pb-1 leading-relaxed"><strong>Advisory, not enforced:</strong> a division is best kept to roughly <strong>11 to 15 sailors.</strong> Larger or smaller divisions are accepted and nothing will block you — treat this as a planning guide only.</li>
    <li class="pb-1 leading-relaxed">Click a Division card to open its sailor list. Inside that list, click a sailor's <strong>name</strong> to see their photo, and in Edit Mode to upload or replace it. A sailor photo is <strong>optional;</strong> the default photo is shown when none has been uploaded.</li>
  </ul>
`;


import { AddRegulatorModalComponent, ManualRegulatorPayload } from './components/add-regulator-modal/add-regulator-modal.component';
import { Call } from '../../../Core/http';

/** Departments that never appear as regulator-tree slots (system/administrative buckets). */
const EXCLUDED_DEPARTMENTS = ['ADMIN', 'HULL'];

@Component({
  selector: "app-know-your-regulators",
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, MasterCard, HelpGuidance, DataGrid, ButtonComponent, IconComponent, AddRegulatorModalComponent],
  templateUrl: "./know-your-regulators.html",
  styleUrl: "./know-your-regulators.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KnowYourRegulators implements OnInit, AfterViewInit {
  private readonly homeApi = inject(HomeApi);
  private readonly call = inject(Call);
  private readonly notify = inject(NotificationService);
  private readonly userService = inject(User);
  readonly helpHtml = HELP_HTML;
  readonly loading = signal(true);
  readonly isEditMode = signal(false);
  /** The Edit/View Mode toggle is shown only to SHIPADMIN users. */
  readonly showEditToggle = signal(false);
  readonly departments = signal<DepartmentRegulators[]>([]);
  readonly rootExpanded = signal(true);

  readonly zoomLevel = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly isPanning = signal(false);

  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;

  @ViewChild('kyrCanvas') kyrCanvasRef!: ElementRef;
  @ViewChildren('deptConnector') deptConnectors!: QueryList<ElementRef>;
  @ViewChildren('regConnector') regConnectors!: QueryList<ElementRef>;
  @ViewChildren('deptCard') deptCards!: QueryList<ElementRef>;
  @ViewChildren('regCard') regCards!: QueryList<ElementRef>;

  readonly showSailorModal = signal(false);
  readonly activeRegulator = signal<RegulatorSummary | null>(null);
  readonly assignedSailors = signal<RegulatorSailor[]>([]);
  readonly unassignedSailors = signal<RegulatorSailor[]>([]);
  readonly selectedSailorIds = signal<Set<number>>(new Set());
  readonly modalLoading = signal(false);
  readonly saving = signal(false);

  // Add Regulator Modal State
  readonly showAddRegulatorModal = signal(false);
  readonly selectedAddDepartment = signal<DepartmentRegulators | null>(null);
  readonly selectedAddSubDepartment = signal<SubDepartmentRegulators | null>(null);
  readonly addRegSailorsList = signal<RegulatorSailor[]>([]);
  readonly selectedAddSailorIds = signal<Set<number>>(new Set());
  readonly loadingAddSailors = signal(false);

  readonly manualFirstName = signal('');
  readonly manualLastName = signal('');
  readonly manualDesignation = signal('');
  readonly manualRank = signal('');
  readonly manualPersonalNumber = signal('');
  readonly addRegError = signal('');

  readonly ranks = signal<RankOption[]>([]);
  rankOptions: string[] = ["-- No rank --"];

  // Regulator Photo Modal State
  readonly showPhotoModal = signal(false);
  readonly activePhotoRegulator = signal<RegulatorSummary | null>(null);
  readonly photoFile = signal<File | null>(null);
  readonly photoPreview = signal<string | null>(null);

  // Edit Regulator Details Modal State
  readonly showDetailsModal = signal(false);
  readonly activeDetailsRegulator = signal<RegulatorSummary | null>(null);
  readonly activeDetailsSubDepartment = signal<SubDepartmentRegulators | null>(null);
  readonly detailsFirstName = signal('');
  readonly detailsLastName = signal('');
  readonly detailsDesignation = signal('');
  readonly detailsRank = signal('');
  readonly detailsPersonalNumber = signal('');
  readonly detailsDepartment = signal('');
  readonly detailsSubDepartment = signal('');
  readonly detailsError = signal('');

  departmentOptions: string[] = [];

  getSubDepartmentName(sub: SubDepartmentRegulators): string {
    return sub.subdep_name || sub.name || "Sub Department";
  }

  getSubDeptOptions(dept: string): string[] {
    const dName = (dept || '').trim().toUpperCase();
    const foundDept = this.departments().find(d => (d.dep_name || d.name || '').trim().toUpperCase() === dName);
    if (foundDept && foundDept.subdepartments && foundDept.subdepartments.length > 0) {
      return foundDept.subdepartments.map(sd => this.getSubDepartmentName(sd));
    }
    return [];
  }

  readonly sailorColumnDefs: ColDef[] = [
    { headerName: "Name", field: "name", flex: 1, minWidth: 150, valueFormatter: (p) => (p["value"] as string) || "-" },
    { headerName: "Rank", field: "rank", flex: 1, minWidth: 100, valueFormatter: (p) => (p["value"] as string) || "-" },
    { headerName: "Personal No.", field: "personalNumber", flex: 1, minWidth: 130, valueFormatter: (p) => (p["value"] as string) || "-" },
    { headerName: "Designation", field: "designation", flex: 1, minWidth: 140, valueFormatter: (p) => (p["value"] as string) || "-" },
  ];

  ngOnInit(): void {
    this.loadTree();
    this.loadRanks();
    this.loadShowEditToggle();
  }

  private async loadShowEditToggle(): Promise<void> {
    try {
      const user = await this.userService.getLoggedInUserDetails();
      const roleName = user?.profile?.role_master_detail?.role_name || "";
      this.showEditToggle.set(roleName.toUpperCase() === "SHIPADMIN");
    } catch {
      this.showEditToggle.set(false);
    }
  }

  async loadRanks(): Promise<void> {
    try {
      const res = await firstValueFrom(this.homeApi.getRanks());
      if (Array.isArray(res) && res.length) {
        this.ranks.set(res);
        this.rankOptions = ["-- No rank --", ...res.map((r) => r.name)];
      }
    } catch { /* empty */ }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.positionConnectors();
      this.centerCanvas();
    }, 100);
    this.deptCards.changes.subscribe(() => setTimeout(() => {
      this.positionConnectors();
      this.centerCanvas();
    }, 50));
    this.regCards.changes.subscribe(() => setTimeout(() => {
      this.positionConnectors();
      this.centerCanvas();
    }, 50));
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.positionConnectors();
    this.centerCanvas();
  }

  async loadTree(): Promise<void> {
    this.loading.set(true);
    try {
      const [treeRes, masterDepts] = await Promise.all([
        firstValueFrom(this.homeApi.getRegulatorsTree()).catch(() => ({ status: 'error', departments: [] as DepartmentRegulators[] })),
        firstValueFrom(this.call.getMasterDepartments()).catch(() => [])
      ]);

      let treeDepts: DepartmentRegulators[] = treeRes.departments ? [...treeRes.departments] : [];
      treeDepts = treeDepts.filter((d) => !EXCLUDED_DEPARTMENTS.includes((d.dep_name || d.name || '').trim().toUpperCase()));

      if (masterDepts && masterDepts.length > 0) {
        const dynamicDeptNames = masterDepts
          .map((d) => d.name)
          .filter((name): name is string => Boolean(name) && !EXCLUDED_DEPARTMENTS.includes(name.trim().toUpperCase()));
        if (dynamicDeptNames.length > 0) {
          this.departmentOptions = dynamicDeptNames;
        }
      } else {
        this.departmentOptions = treeDepts
          .map((d) => d.dep_name || d.name || '')
          .filter((name): name is string => Boolean(name) && !EXCLUDED_DEPARTMENTS.includes(name.trim().toUpperCase()));
      }

      const finalDepts: DepartmentRegulators[] = [];

      const allDeptKeys = new Set<string>();
      if (masterDepts && masterDepts.length > 0) {
        masterDepts.forEach((m: DepartmentMaster) => {
          if (m.name && !EXCLUDED_DEPARTMENTS.includes(m.name.trim().toUpperCase())) {
            allDeptKeys.add(m.name.trim().toUpperCase());
          }
        });
      }
      treeDepts.forEach((t) => {
        const tName = (t.dep_name || t.name || '').trim().toUpperCase();
        if (tName && !EXCLUDED_DEPARTMENTS.includes(tName)) {
          allDeptKeys.add(tName);
        }
      });

      Array.from(allDeptKeys).forEach((deptKey, idx) => {
        const mDept = (masterDepts || []).find((m: DepartmentMaster) => (m.name || '').trim().toUpperCase() === deptKey);
        const treeDept = treeDepts.find((td) => (td.dep_name || td.name || '').trim().toUpperCase() === deptKey);

        const subDeptMap = new Map<string, SubDepartmentRegulators>();

        // 1. Load subdepartments from masterDepts
        if (mDept && mDept.subdepartments && mDept.subdepartments.length > 0) {
          mDept.subdepartments.forEach((sd: SubDepartmentMaster) => {
            const sName = (sd.name || '').trim();
            if (sName) {
              subDeptMap.set(sName.toUpperCase(), {
                id: sd.id,
                name: sName,
                subdep_name: sName,
                code: sd.code || undefined,
                description: sd.description || undefined,
                regulators: [],
                expanded: true
              });
            }
          });
        }

        // 2. Load / merge subdepartments & regulators from treeDept
        if (treeDept && treeDept.subdepartments && treeDept.subdepartments.length > 0) {
          treeDept.subdepartments.forEach((tSub: SubDepartmentRegulators) => {
            const sName = (tSub.subdep_name || tSub.name || '').trim();
            if (sName) {
              const key = sName.toUpperCase();
              const existing = subDeptMap.get(key);
              const regs = (tSub.regulators || []).map((r: RegulatorSummary) => ({
                ...r,
                sub_department_name: r.sub_department_name || sName
              }));

              if (existing) {
                existing.regulators = regs;
                if (tSub.id) existing.id = tSub.id;
              } else {
                subDeptMap.set(key, {
                  id: tSub.id || (88000 + subDeptMap.size),
                  name: sName,
                  subdep_name: sName,
                  regulators: regs,
                  expanded: true
                });
              }
            }
          });
        }

        const subDepts = Array.from(subDeptMap.values());
        const deptRegulators: RegulatorSummary[] = [];

        // 3. Handle direct regulators under treeDept (if any)
        if (treeDept && treeDept.regulators && treeDept.regulators.length > 0) {
          treeDept.regulators.forEach((reg) => {
            const subName = (reg.sub_department_name || '').trim().toUpperCase();
            if (subDepts.length > 0) {
              const matchedSub = subDepts.find((s) =>
                this.getSubDepartmentName(s).trim().toUpperCase() === subName ||
                (reg.sub_department_id && s.id === reg.sub_department_id)
              );
              if (matchedSub) {
                if (!matchedSub.regulators.some((r: RegulatorSummary) => r.id === reg.id)) {
                  matchedSub.regulators.push(reg);
                }
              } else {
                const desigMatch = subDepts.find(s => (reg.designation || '').toUpperCase().includes(this.getSubDepartmentName(s).toUpperCase()));
                if (desigMatch) {
                  if (!desigMatch.regulators.some((r: RegulatorSummary) => r.id === reg.id)) {
                    desigMatch.regulators.push(reg);
                  }
                } else {
                  deptRegulators.push(reg);
                }
              }
            } else {
              deptRegulators.push(reg);
            }
          });
        }

        // Handle leftover regulators in a department that HAS subdepartments
        if (subDepts.length > 0 && deptRegulators.length > 0) {
          let notSetSub = subDepts.find(s => this.getSubDepartmentName(s).trim().toUpperCase() === 'SUB-DEPARTMENT NOT SET');
          if (!notSetSub) {
            notSetSub = {
              id: 999900 + idx,
              name: 'SUB-DEPARTMENT NOT SET',
              subdep_name: 'SUB-DEPARTMENT NOT SET',
              regulators: [],
              expanded: true
            };
            subDepts.push(notSetSub);
          }
          deptRegulators.forEach(r => {
            if (!notSetSub!.regulators.some((item: RegulatorSummary) => item.id === r.id)) {
              notSetSub!.regulators.push(r);
            }
          });
        }

        finalDepts.push({
          id: mDept?.id || treeDept?.id || (99000 + idx),
          name: mDept?.name || treeDept?.dep_name || treeDept?.name || deptKey,
          dep_name: mDept?.name || treeDept?.dep_name || treeDept?.name || deptKey,
          code: mDept?.code,
          dep_code: mDept?.dep_code,
          regulators: deptRegulators,
          subdepartments: subDepts,
          expanded: true
        });
      });

      // Handle orphan regulators with unassigned department
      const orphanRegulators: RegulatorSummary[] = [];
      treeDepts.forEach((t) => {
        const tName = (t.dep_name || t.name || '').trim().toUpperCase();
        if (!tName || tName === 'UNKNOWN' || tName === 'NO DEPARTMENT RECORDED' || !allDeptKeys.has(tName)) {
          if (t.regulators && t.regulators.length > 0) {
            t.regulators.forEach(r => {
              if (!orphanRegulators.some(o => o.id === r.id)) {
                orphanRegulators.push(r);
              }
            });
          }
          if (t.subdepartments && t.subdepartments.length > 0) {
            t.subdepartments.forEach(sd => {
              if (sd.regulators && sd.regulators.length > 0) {
                sd.regulators.forEach(r => {
                  if (!orphanRegulators.some(o => o.id === r.id)) {
                    orphanRegulators.push(r);
                  }
                });
              }
            });
          }
        }
      });

      if (orphanRegulators.length > 0) {
        let noDeptObj = finalDepts.find(d => (d.dep_name || d.name || '').trim().toUpperCase() === 'NO DEPARTMENT RECORDED');
        if (!noDeptObj) {
          noDeptObj = {
            id: 999999,
            name: 'NO DEPARTMENT RECORDED',
            dep_name: 'NO DEPARTMENT RECORDED',
            regulators: [],
            subdepartments: [],
            expanded: true
          };
          finalDepts.push(noDeptObj);
        }
        orphanRegulators.forEach(r => {
          if (!noDeptObj!.regulators.some(existing => existing.id === r.id)) {
            noDeptObj!.regulators.push(r);
          }
        });
      }

      this.departments.set(finalDepts);
      setTimeout(() => {
        this.positionConnectors();
        this.centerCanvas();
      }, 100);
    } catch {
      this.notify.error("Failed to load regulators.");
    } finally {
      this.loading.set(false);
    }
  }

  getDepartmentRegulatorsCount(department: DepartmentRegulators): number {
    let count = (department.regulators || []).length;
    if (department.subdepartments && department.subdepartments.length > 0) {
      for (const sub of department.subdepartments) {
        count += (sub.regulators || []).length;
      }
    }
    return count;
  }

  getSubDepartmentRegulatorsCount(sub: SubDepartmentRegulators): number {
    return (sub.regulators || []).length;
  }

  getDepartmentName(department: DepartmentRegulators): string {
    return department.dep_name || department.name || "Department";
  }

  zoomIn(): void {
    this.zoomLevel.set(Math.min(this.zoomLevel() + 0.1, 3));
    setTimeout(() => this.centerCanvas(), 50);
  }

  zoomOut(): void {
    this.zoomLevel.set(Math.max(this.zoomLevel() - 0.1, 0.3));
    setTimeout(() => this.centerCanvas(), 50);
  }

  resetZoom(): void {
    this.zoomLevel.set(1);
    this.panX.set(0);
    this.panY.set(0);
    this.centerCanvas();
  }

  onCanvasMouseDown(event: MouseEvent): void {
    this.isPanning.set(true);
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.panStartX = this.panX();
    this.panStartY = this.panY();
  }

  onCanvasMouseMove(event: MouseEvent): void {
    if (!this.isPanning()) return;
    this.panX.set(this.panStartX + (event.clientX - this.dragStartX));
    this.panY.set(this.panStartY + (event.clientY - this.dragStartY));
  }

  onCanvasMouseUp(): void {
    this.isPanning.set(false);
  }

  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.isPanning.set(true);
      this.dragStartX = event.touches[0].clientX;
      this.dragStartY = event.touches[0].clientY;
      this.panStartX = this.panX();
      this.panStartY = this.panY();
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.isPanning() || event.touches.length !== 1) return;
    this.panX.set(this.panStartX + (event.touches[0].clientX - this.dragStartX));
    this.panY.set(this.panStartY + (event.touches[0].clientY - this.dragStartY));
  }

  onTouchEnd(): void {
    this.isPanning.set(false);
  }

  /** Center the scroll position of the canvas on the top department node and clear pan offsets */
  centerCanvas(): void {
    const canvasEl = this.kyrCanvasRef?.nativeElement as HTMLElement;
    if (!canvasEl) return;
    this.panX.set(0);
    this.panY.set(0);

    setTimeout(() => {
      const maxScroll = canvasEl.scrollWidth - canvasEl.clientWidth;
      if (maxScroll > 0) {
        canvasEl.scrollLeft = maxScroll / 2;
      } else {
        canvasEl.scrollLeft = 0;
      }
    }, 30);
  }

  toggleDepartment(department: DepartmentRegulators): void {
    department.expanded = !department.expanded;
    this.departments.set([...this.departments()]);
    setTimeout(() => {
      this.positionConnectors();
      this.centerCanvas();
    }, 50);
  }

  toggleRootDepartments(): void {
    this.rootExpanded.set(!this.rootExpanded());
    setTimeout(() => {
      this.positionConnectors();
      this.centerCanvas();
    }, 50);
  }

  private positionConnectors(): void {
    const allDepts = this.deptCards.toArray();
    if (allDepts.length > 0) {
      const firstDeptEl = allDepts[0].nativeElement as HTMLElement;
      const lastDeptEl = allDepts[allDepts.length - 1].nativeElement as HTMLElement;
      const deptsParent = firstDeptEl.closest('.departments-wrapper') as HTMLElement;
      if (deptsParent) {
        const connector = deptsParent.querySelector('[data-dept-horizontal-connector]') as HTMLElement;
        if (connector) {
          const firstWrapper = firstDeptEl.closest('.department-wrapper') as HTMLElement;
          const lastWrapper = lastDeptEl.closest('.department-wrapper') as HTMLElement;

          if (firstWrapper && lastWrapper) {
            const firstCenterX = firstWrapper.offsetLeft + (firstDeptEl.offsetLeft + firstDeptEl.offsetWidth / 2);
            const lastCenterX = lastWrapper.offsetLeft + (lastDeptEl.offsetLeft + lastDeptEl.offsetWidth / 2);

            connector.style.left = firstCenterX + 'px';
            connector.style.width = Math.max(0, lastCenterX - firstCenterX) + 'px';
          }
        }
      }
    }

    const allRegs = this.regCards.toArray();
    allRegs.forEach((regCard) => {
      const regEl = regCard.nativeElement as HTMLElement;
      const regParent = regEl.closest('.department-wrapper') as HTMLElement;
      if (!regParent) return;

      const siblingsInGroup = Array.from(regParent.querySelectorAll('[data-regulator-card]')) as HTMLElement[];
      if (siblingsInGroup.length <= 1) return;

      const firstRegInGroup = siblingsInGroup[0];
      const lastRegInGroup = siblingsInGroup[siblingsInGroup.length - 1];

      const firstRegWrapper = firstRegInGroup.closest('.regulator-wrapper') as HTMLElement;
      const lastRegWrapper = lastRegInGroup.closest('.regulator-wrapper') as HTMLElement;

      const connector = regParent.querySelector('[data-reg-horizontal-connector]') as HTMLElement;
      if (connector && firstRegWrapper && lastRegWrapper) {
        const firstCenterX = firstRegWrapper.offsetLeft + (firstRegInGroup.offsetLeft + firstRegInGroup.offsetWidth / 2);
        const lastCenterX = lastRegWrapper.offsetLeft + (lastRegInGroup.offsetLeft + lastRegInGroup.offsetWidth / 2);

        connector.style.left = firstCenterX + 'px';
        connector.style.width = Math.max(0, lastCenterX - firstCenterX) + 'px';
      }
    });
  }

  toggleMode(): void {
    this.isEditMode.set(!this.isEditMode());
    setTimeout(() => this.centerCanvas(), 50);
  }

  async openRegulator(regulator: RegulatorSummary): Promise<void> {
    this.activeRegulator.set(regulator);
    this.showSailorModal.set(true);
    this.modalLoading.set(true);
    this.assignedSailors.set([]);
    this.unassignedSailors.set([]);
    this.selectedSailorIds.set(new Set());

    try {
      const res = await firstValueFrom(this.homeApi.getRegulatorSailors(regulator.id));
      this.assignedSailors.set(res.assigned || []);
      this.unassignedSailors.set(res.unassigned || []);
      this.selectedSailorIds.set(new Set(res.assigned.map((s) => s.id)));
    } catch {
      this.notify.error("Failed to load sailors for this regulator.");
    } finally {
      this.modalLoading.set(false);
    }
  }

  closeSailorModal(): void {
    this.showSailorModal.set(false);
    this.activeRegulator.set(null);
  }

  toggleSailorSelection(sailorId: number): void {
    const set = new Set(this.selectedSailorIds());
    if (set.has(sailorId)) {
      set.delete(sailorId);
    } else {
      set.add(sailorId);
    }
    this.selectedSailorIds.set(set);
  }

  allEligibleSailors(): RegulatorSailor[] {
    return [...this.assignedSailors(), ...this.unassignedSailors()];
  }

  async saveAssignments(): Promise<void> {
    const regulator = this.activeRegulator();
    if (!regulator) return;

    this.saving.set(true);
    try {
      await firstValueFrom(
        this.homeApi.assignRegulatorBulk(regulator.id, Array.from(this.selectedSailorIds())),
      );
      this.closeSailorModal();
      await this.loadTree();
    } catch {
      this.notify.error("Failed to save assignments.");
    } finally {
      this.saving.set(false);
    }
  }

  toggleSubDepartment(sub: SubDepartmentRegulators): void {
    sub.expanded = !sub.expanded;
    this.departments.set([...this.departments()]);
    setTimeout(() => {
      this.positionConnectors();
      this.centerCanvas();
    }, 50);
  }

  addRegulator(department: DepartmentRegulators, subdepartment?: SubDepartmentRegulators): void {
    this.openAddRegulatorModal(department, subdepartment);
  }

  async openAddRegulatorModal(department: DepartmentRegulators, subdepartment?: SubDepartmentRegulators): Promise<void> {
    this.selectedAddDepartment.set(department);
    this.selectedAddSubDepartment.set(subdepartment || null);
    this.showAddRegulatorModal.set(true);
    this.selectedAddSailorIds.set(new Set());
    this.manualFirstName.set('');
    this.manualLastName.set('');
    this.manualDesignation.set('');
    this.manualRank.set('');
    this.manualPersonalNumber.set('');
    this.addRegError.set('');
    this.loadingAddSailors.set(true);

    try {
      const res = await firstValueFrom(this.homeApi.getRegulatorSailors(department.id));
      const list = [...(res.unassigned || []), ...(res.assigned || [])];
      this.addRegSailorsList.set(list);
    } catch {
      this.addRegSailorsList.set([]);
    } finally {
      this.loadingAddSailors.set(false);
    }
  }

  closeAddRegulatorModal(): void {
    this.showAddRegulatorModal.set(false);
    this.selectedAddDepartment.set(null);
    this.selectedAddSubDepartment.set(null);
  }

  toggleAddSailorSelection(sailorId: number): void {
    const set = new Set(this.selectedAddSailorIds());
    if (set.has(sailorId)) {
      set.delete(sailorId);
    } else {
      set.add(sailorId);
    }
    this.selectedAddSailorIds.set(set);
  }

  toggleSelectAllAddSailors(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      const allIds = new Set(this.addRegSailorsList().map(s => s.id));
      this.selectedAddSailorIds.set(allIds);
    } else {
      this.selectedAddSailorIds.set(new Set());
    }
  }

  async confirmMarkAsRegulators(selectedIds?: number[]): Promise<void> {
    const ids = selectedIds || Array.from(this.selectedAddSailorIds());
    if (!ids.length) {
      this.notify.warning("Please select at least one sailor to mark as regulator.");
      return;
    }
    this.saving.set(true);
    try {
      for (const id of ids) {
        await firstValueFrom(this.homeApi.toggleSailorRegulator(id, true));
      }
      this.closeAddRegulatorModal();
      await this.loadTree();
    } catch {
    } finally {
      this.saving.set(false);
    }
  }

  async confirmCreateManualRegulator(manualData?: ManualRegulatorPayload): Promise<void> {
    const firstName = (manualData ? manualData.firstName : this.manualFirstName()).trim();
    if (!firstName) {
      this.addRegError.set("First name is required.");
      return;
    }
    this.saving.set(true);
    try {
      const lastName = (manualData ? manualData.lastName : this.manualLastName()).trim();
      const desig = (manualData ? manualData.designation : this.manualDesignation()).trim();
      const rk = (manualData ? manualData.rank : this.manualRank()).trim();
      const pno = (manualData ? manualData.personalNumber : this.manualPersonalNumber()).trim();

      const dept = this.selectedAddDepartment();
      const sub = this.selectedAddSubDepartment();
      const subDeptName = manualData?.subDepartmentName || sub?.name || "";

      const rankMatch = rk && rk !== "-- No rank --"
        ? this.ranks().find((r) => r.name.toUpperCase() === rk.toUpperCase())
        : undefined;

      const payload: CreateRegulatorPayload = {
        firstname: firstName,
        lastname: lastName,
        designation: desig,
        personal_number: pno,
        department_id: dept && dept.id < 99000 ? dept.id : 0,
        executive_sub_department: subDeptName,
        rank_id: rankMatch ? rankMatch.id : 0,
      };

      await firstValueFrom(this.homeApi.createRegulator(payload));
      this.closeAddRegulatorModal();
      await this.loadTree();
    } catch {
      this.notify.error("Failed to create regulator manually.");
    } finally {
      this.saving.set(false);
    }
  }

  async unmarkRegulator(event: Event, regulator: RegulatorSummary): Promise<void> {
    event.stopPropagation();
    try {
      await firstValueFrom(this.homeApi.toggleSailorRegulator(regulator.id, false));
      await this.loadTree();
    } catch {
    }
  }

  async deleteRegulator(event: Event, regulator: RegulatorSummary): Promise<void> {
    event.stopPropagation();
    try {
      await firstValueFrom(this.homeApi.deleteHierarchyNode(regulator.id));
      await this.loadTree();
    } catch {
    }
  }

  uploadPhoto(event: Event, regulator: RegulatorSummary): void {
    event.stopPropagation();
    this.activePhotoRegulator.set(regulator);
    this.photoFile.set(null);
    this.photoPreview.set(null);
    this.showPhotoModal.set(true);
  }

  closePhotoModal(): void {
    this.showPhotoModal.set(false);
    this.activePhotoRegulator.set(null);
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.photoFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => this.photoPreview.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  async confirmRemovePhoto(): Promise<void> {
    const reg = this.activePhotoRegulator();
    if (!reg) return;
    this.saving.set(true);
    try {
      const payload = new FormData();
      payload.append("node_db_id", String(reg.id));
      payload.append("photo", "");
      payload.append("remove_photo", "1");
      await firstValueFrom(this.homeApi.updateRegulatorPhoto(payload));
      this.closePhotoModal();
      await this.loadTree();
    } catch {
      this.notify.error("Failed to remove photo.");
    } finally {
      this.saving.set(false);
    }
  }

  async confirmSavePhoto(): Promise<void> {
    const reg = this.activePhotoRegulator();
    const file = this.photoFile();
    if (!reg || !file) return;
    this.saving.set(true);
    try {
      const payload = new FormData();
      payload.append("node_db_id", String(reg.id));
      payload.append("photo", file);
      payload.append("remove_photo", "0");
      await firstValueFrom(this.homeApi.updateRegulatorPhoto(payload));
      this.closePhotoModal();
      await this.loadTree();
    } catch {
      this.notify.error("Failed to save photo.");
    } finally {
      this.saving.set(false);
    }
  }

  editRegulatorDetails(event: Event, regulator: RegulatorSummary, department?: DepartmentRegulators, subdepartment?: SubDepartmentRegulators): void {
    event.stopPropagation();
    this.activeDetailsRegulator.set(regulator);
    this.activeDetailsSubDepartment.set(subdepartment || null);
    const parts = (regulator.name || '').split(' ');
    this.detailsFirstName.set(parts[0] || '');
    this.detailsLastName.set(parts.slice(1).join(' ') || '');
    this.detailsDesignation.set(regulator.designation || '');
    this.detailsRank.set(regulator.rank || '');
    this.detailsPersonalNumber.set('');

    const currentDeptName = department ? this.getDepartmentName(department) : '';
    const initialDept = (currentDeptName && !EXCLUDED_DEPARTMENTS.includes(currentDeptName.toUpperCase()))
      ? currentDeptName
      : (this.departmentOptions[0] || '');

    this.detailsDepartment.set(initialDept);
    this.detailsSubDepartment.set(subdepartment ? (subdepartment.name || subdepartment.subdep_name || '') : (regulator.sub_department_name || ''));
    this.detailsError.set('');
    this.showDetailsModal.set(true);
  }

  closeDetailsModal(): void {
    this.showDetailsModal.set(false);
    this.activeDetailsRegulator.set(null);
    this.activeDetailsSubDepartment.set(null);
  }

  async confirmSaveDetails(): Promise<void> {
    const reg = this.activeDetailsRegulator();
    if (!reg) return;
    const firstName = this.detailsFirstName().trim();
    if (!firstName) {
      this.detailsError.set("First name is required.");
      return;
    }
    this.saving.set(true);
    try {
      const rankName = this.detailsRank().trim();
      const deptName = this.detailsDepartment().trim();

      const rankMatch = rankName && rankName !== "-- No rank --"
        ? this.ranks().find((r) => r.name.toUpperCase() === rankName.toUpperCase())
        : undefined;

      const deptMatch = deptName
        ? this.departments().find((d) => (d.dep_name || d.name || '').trim().toUpperCase() === deptName.toUpperCase())
        : undefined;

      const payload: UpdateRegulatorProfilePayload = {
        node_db_id: reg.id,
        rank_id: rankMatch ? rankMatch.id : 0,
        personal_number: this.detailsPersonalNumber().trim(),
        firstname: firstName,
        lastname: this.detailsLastName().trim(),
        designation: this.detailsDesignation().trim(),
        department_id: deptMatch && deptMatch.id < 99000 ? deptMatch.id : 0,
        executive_sub_department: this.detailsSubDepartment().trim(),
      };

      await firstValueFrom(this.homeApi.updateRegulatorProfile(payload));
      this.closeDetailsModal();
      await this.loadTree();
    } catch {
      this.notify.error("Failed to save details.");
    } finally {
      this.saving.set(false);
    }
  }
}
