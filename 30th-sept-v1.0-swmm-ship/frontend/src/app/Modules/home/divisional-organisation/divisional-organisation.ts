import { ButtonComponent } from '../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, ViewChild, computed, inject, signal, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { HomeApi } from "../services/home-api";
import { NotificationService } from "../../../Core/services/notification/notification.service";
import { TabAccessService } from "../../../Core/services/user/tab-access.service";
import { User } from "../../../Core/services/user/user";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { ModalComponent } from "../../../shared/components/modal/modal.component";
import { MasterCard } from "../../refit-maintenance/master-card/master-card";
import {
  AvailableUser,
  CHILD_TYPE,
  HierarchyContextUsers,
  HierarchyNode,
  HierarchyNodeType,
  NODE_COLORS,
  NODE_LABELS,
  RawAvailableUser,
  RawHierarchyNode,
  usersForHierarchyType,
} from "./divisional-organisation.model";
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';
import { ConfirmDeleteModal } from "../../../shared/components/confirm-delete-modal/confirm-delete-modal";

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

import { DetailDrawer } from '../../../shared/components/detail-drawer/detail-drawer';

@Component({
  selector: "app-divisional-organisation",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, ModalComponent, MasterCard, HelpGuidance, ConfirmDeleteModal, ButtonComponent, DetailDrawer],
  templateUrl: "./divisional-organisation.html",
  styleUrl: "./divisional-organisation.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DivisionalOrganisation implements OnInit {
  private readonly homeApi = inject(HomeApi);
  private readonly notify = inject(NotificationService);
  private readonly tabAccess = inject(TabAccessService);
  private readonly userService = inject(User);
  @ViewChild('doCanvas') readonly doCanvasRef?: ElementRef<HTMLDivElement>;
  readonly helpHtml = HELP_HTML;
  readonly nodeLabels = NODE_LABELS;
  readonly nodeColors = NODE_COLORS;

  readonly loading = signal(true);
  readonly hierarchy = signal<HierarchyNode | null>(null);
  readonly hierarchyContext = signal<HierarchyContextUsers | null>(null);
  readonly isEditMode = signal(false);
  readonly canEditDivisional = signal(false);
  /** The Edit/View Mode toggle is shown only to SHIPADMIN users. */
  readonly showEditToggle = signal(false);
  readonly zoomLevel = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly isPanning = signal(false);
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;

  // Node add/edit modal
  readonly showNodeModal = signal(false);
  readonly modalNodeType = signal<HierarchyNodeType | null>(null);
  readonly modalParentDbId = signal<number | null>(null);
  readonly modalEditingNode = signal<HierarchyNode | null>(null);
  readonly modalDivisionName = signal("");
  readonly modalSelectedUserId = signal<number | null>(null);
  readonly modalAdditionalDuty = signal("");
  readonly modalPhotoFile = signal<File | null>(null);
  readonly modalPhotoPreview = signal<string | null>(null);
  readonly modalPhotoRemoved = signal(false);
  readonly modalIsDepartmentalOfficer = signal(false);
  readonly modalParentType = signal<HierarchyNodeType | null>(null);
  readonly modalUsers = signal<AvailableUser[]>([]);
  readonly modalError = signal("");
  readonly saving = signal(false);

  readonly isUnderHod = computed(() => {
    if (this.modalNodeType() !== 'divisional_officer') return false;
    return this.modalParentType() === 'hod';
  });

  readonly currentPhotoName = computed(() => {
    if (this.modalPhotoRemoved()) {
      return "No file chosen";
    }
    const file = this.modalPhotoFile();
    if (file) {
      return file.name;
    }
    const editing = this.modalEditingNode();
    if (editing?.photoUrl) {
      const parts = editing.photoUrl.split("/");
      return parts[parts.length - 1] || "Uploaded photo";
    }
    return "No file chosen";
  });

  // Sailor list modal
  readonly showSailorModal = signal(false);
  readonly sailorModalDivision = signal<HierarchyNode | null>(null);
  readonly sailorSearchText = signal("");
  readonly sailorPageSize = signal(10);
  readonly sailorCurrentPage = signal(1);
  readonly sailorSortField = signal<string>("name");
  readonly sailorSortOrder = signal<"asc" | "desc">("asc");

  readonly filteredSailorsList = computed(() => {
    const div = this.sailorModalDivision();
    if (!div || !div.children) return [];

    const search = this.sailorSearchText().trim().toLowerCase();
    let list = div.children;

    if (search) {
      list = list.filter((s) =>
        [s.name, s.rank, s.designation, s.personalNumber].some((v) =>
          (v || "").toLowerCase().includes(search)
        )
      );
    }

    const field = this.sailorSortField();
    const order = this.sailorSortOrder() === "asc" ? 1 : -1;

    return [...list].sort((a, b) => {
      let valA = "";
      let valB = "";
      if (field === "photoUploaded") {
        valA = a.photoUploaded ? "yes" : "no";
        valB = b.photoUploaded ? "yes" : "no";
      } else if (field === "isRegulator") {
        valA = a.isRegulator ? "yes" : "no";
        valB = b.isRegulator ? "yes" : "no";
      } else {
        valA = ((a as unknown as Record<string, unknown>)[field] || "").toString().toLowerCase();
        valB = ((b as unknown as Record<string, unknown>)[field] || "").toString().toLowerCase();
      }
      return valA.localeCompare(valB) * order;
    });
  });

  readonly totalSailorPages = computed(() => {
    const count = this.filteredSailorsList().length;
    const size = this.sailorPageSize();
    return Math.ceil(count / size) || 1;
  });

  readonly paginatedSailorsList = computed(() => {
    const list = this.filteredSailorsList();
    const page = this.sailorCurrentPage();
    const size = this.sailorPageSize();
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  });

  readonly sailorStartItem = computed(() => {
    const list = this.filteredSailorsList();
    if (list.length === 0) return 0;
    return (this.sailorCurrentPage() - 1) * this.sailorPageSize() + 1;
  });

  readonly sailorEndItem = computed(() => {
    const list = this.filteredSailorsList();
    return Math.min(this.sailorCurrentPage() * this.sailorPageSize(), list.length);
  });

  readonly sailorPageArray = computed(() => {
    const total = this.totalSailorPages();
    const pages: number[] = [];
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
    return pages;
  });

  // Add sailor modal
  readonly showAddSailorModal = signal(false);
  readonly addSailorDivision = signal<HierarchyNode | null>(null);
  readonly addSailorUsers = signal<AvailableUser[]>([]);
  readonly addSailorSearch = signal("");
  readonly addSailorSelectedRows = signal<AvailableUser[]>([]);
  readonly addSailorPhotoFile = signal<File | null>(null);
  readonly addSailorDropdownOpen = signal(false);

  readonly addSailorPhotoName = computed(() => {
    return this.addSailorPhotoFile()?.name || "No file chosen";
  });

  readonly addSailorFilteredUsers = computed(() => {
    const search = this.addSailorSearch().trim().toLowerCase();
    if (!search) return this.addSailorUsers();
    return this.addSailorUsers().filter((u) =>
      [u.name, u.rank, u.designation, u.personal_number].some((v) =>
        (v || "").toLowerCase().includes(search),
      ),
    );
  });

  readonly isAllSailorsSelected = computed(() => {
    const users = this.addSailorFilteredUsers();
    if (!users.length) return false;
    const selected = this.addSailorSelectedRows();
    return users.every((u) => selected.some((s) => s.id === u.id));
  });

  readonly modalTitle = computed(() => {
    const type = this.modalNodeType();
    if (!type) return "";
    return `${this.modalEditingNode() ? "EDIT" : "ADD"} ${this.nodeLabels[type].toUpperCase()} DETAILS`;
  });

  ngOnInit(): void {
    this.loadHierarchy();
    this.loadEditPermission();
    this.loadShowEditToggle();
  }

  private async loadEditPermission(): Promise<void> {
    try {
      const canEdit = await this.tabAccess.canAccessDivisionalOrganisation();
      this.canEditDivisional.set(canEdit);
    } catch {
      this.canEditDivisional.set(false);
    }
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

  async loadHierarchy(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.homeApi.getHierarchyTree());
      this.hierarchyContext.set(res.context ?? null);
      this.hierarchy.set(res.hierarchy ? this.hydrate(res.hierarchy) : null);
    } catch {
      this.notify.error("Failed to load divisional organisation.");
    } finally {
      this.loading.set(false);
      setTimeout(() => this.alignTreeToLeftEdge(), 50);
    }
  }

  /** Centers the tree and scrolls canvas to middle when tree overflows. */
  private alignTreeToLeftEdge(): void {
    const canvasEl = this.doCanvasRef?.nativeElement;
    if (!canvasEl) return;
    this.panX.set(0);
    this.panY.set(0);

    setTimeout(() => {
      if (canvasEl.scrollWidth > canvasEl.clientWidth) {
        canvasEl.scrollLeft = (canvasEl.scrollWidth - canvasEl.clientWidth) / 2;
      } else {
        canvasEl.scrollLeft = 0;
      }
    }, 50);
  }

  private sanitizeValue(val?: string | null): string {
    if (!val || val.trim().toLowerCase() === "unknown") return "";
    return val.trim();
  }

  private normalizeUserId(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === "") return null;
    const id = Number(value);
    return Number.isFinite(id) ? id : null;
  }

  private rawSelectedUserId(raw: RawHierarchyNode): number | null {
    const nestedUserId =
      typeof raw.user === "object" && raw.user !== null ? raw.user.id : raw.user;
    return this.normalizeUserId(
      raw.selectedUserId ?? raw.selected_user_id ?? raw.userId ?? raw.user_id ?? nestedUserId,
    );
  }

  private hierarchyUsersInUse(excludeNode?: HierarchyNode | null): Set<number> {
    const usedIds = new Set<number>();
    const visit = (node: HierarchyNode): void => {
      if (node !== excludeNode && node.selectedUserId !== null) {
        usedIds.add(node.selectedUserId);
      }
      node.children.forEach(visit);
    };

    const root = this.hierarchy();
    if (root) visit(root);
    return usedIds;
  }

  private isUserInHierarchy(user: AvailableUser, excludeNode?: HierarchyNode | null): boolean {
    const usedIds = this.hierarchyUsersInUse(excludeNode);
    if (usedIds.has(user.id)) return true;

    let found = false;
    const visit = (node: HierarchyNode): void => {
      if (node === excludeNode) return;
      const sameName = user.name.trim() && node.name.trim() &&
        user.name.trim().toLowerCase() === node.name.trim().toLowerCase();
      const sameNumber = user.personal_number.trim() && node.personalNumber.trim() &&
        user.personal_number.trim().toLowerCase() === node.personalNumber.trim().toLowerCase();
      if (sameName || sameNumber) found = true;
      node.children.forEach(visit);
    };

    const root = this.hierarchy();
    if (root) visit(root);
    return found;
  }

  private hydrate(raw: RawHierarchyNode, depth = 0): HierarchyNode {
    return {
      id: "db-" + raw.dbId,
      dbId: raw.dbId,
      type: raw.type,
      name: this.sanitizeValue(raw.name),
      rank: this.sanitizeValue(raw.rank),
      designation: raw.designation || "",
      additionalDuty: raw.additionalDuty || "",
      personalNumber: raw.personalNumber || "",
      photoUrl: this.resolvePhotoUrl(raw.photoUrl),
      photoUploaded: !!raw.photoUrl?.trim(),
      divisionName: this.sanitizeValue(raw.divisionName),
      isRegulator: !!raw.isRegulator,
      isDepartmentalOfficer:
        !!raw.isDepartmentOfficer ||
        !!raw.isDepartmentalOfficer ||
        !!raw.is_departmental_officer,
      selectedUserId: this.rawSelectedUserId(raw),
      collapsed: false,
      children: (raw.children || []).map((c) => this.hydrate(c, depth + 1)),
    };
  }

  resolvePhotoUrl(url?: string | null): string {
    if (!url) return "assets/images/demo_pic.jpg";
    if (url.startsWith("http") || url.startsWith("assets/") || url.startsWith("assests/")) return url;
    return `${this.homeApi.baseUrl}${url.replace(/^\//, "")}`;
  }

  toggleMode(): void {
    this.isEditMode.set(!this.isEditMode());
    setTimeout(() => this.alignTreeToLeftEdge(), 50);
  }

  toggleCollapse(node: HierarchyNode): void {
    node.collapsed = !node.collapsed;
    this.hierarchy.set(this.hierarchy() ? { ...this.hierarchy()! } : null);
    setTimeout(() => this.alignTreeToLeftEdge(), 50);
  }

  childType(type: HierarchyNodeType): HierarchyNodeType | undefined {
    return CHILD_TYPE[type];
  }

  findParentNode(childDbId: number | null, current = this.hierarchy()): HierarchyNode | null {
    if (!childDbId || !current || !current.children) return null;
    for (const child of current.children) {
      if (child.dbId === childDbId) {
        return current;
      }
      const found = this.findParentNode(childDbId, child);
      if (found) return found;
    }
    return null;
  }

  findNodeByDbId(dbId: number | null, current = this.hierarchy()): HierarchyNode | null {
    if (!dbId || !current) return null;
    if (current.dbId === dbId) return current;
    for (const child of current.children || []) {
      const found = this.findNodeByDbId(dbId, child);
      if (found) return found;
    }
    return null;
  }

  availableChildTypes(node: HierarchyNode): HierarchyNodeType[] {
    if (node.type === "co") return ["hod"];
    if (node.type === "hod") return ["divisional_officer"];
    if (node.type === "divisional_officer") {
      if (!node.children || node.children.length === 0) {
        return ["divisional_officer", "division"];
      }
      const firstChildType = node.children[0]?.type;
      if (firstChildType === "divisional_officer") {
        return ["divisional_officer"];
      }
      if (firstChildType === "division") {
        return ["division"];
      }
      return ["divisional_officer", "division"];
    }
    return [];
  }

  canAddChild(node: HierarchyNode): boolean {
    return this.availableChildTypes(node).length > 0;
  }

  colorFor(type: HierarchyNodeType): string {
    return NODE_COLORS[type];
  }

  labelFor(type: HierarchyNodeType | undefined): string {
    return type ? NODE_LABELS[type] : "";
  }

  zoomIn(): void {
    this.zoomLevel.set(Math.min(this.zoomLevel() + 0.1, 3));
  }

  zoomOut(): void {
    this.zoomLevel.set(Math.max(this.zoomLevel() - 0.1, 0.3));
  }

  resetZoom(): void {
    this.zoomLevel.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  onWheelZoom(event: WheelEvent): void {
    // Disabled mouse cursor wheel zoom — zoom is controlled only via +/- buttons
    /*
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const oldZoom = this.zoomLevel();
    const contentX = (mouseX - this.panX()) / oldZoom;
    const contentY = (mouseY - this.panY()) / oldZoom;

    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    const newZoom = Math.min(Math.max(oldZoom + delta, 0.3), 3);

    this.zoomLevel.set(newZoom);
    this.panX.set(mouseX - contentX * newZoom);
    this.panY.set(mouseY - contentY * newZoom);
    */
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

  onPhotoError(node: HierarchyNode): void {
    node.photoUrl = null;
  }

  // ── Add / Edit node modal ──────────────────────────────────────────
  addCO(): void {
    if (this.hierarchy()) {
      this.notify.warning("A Commanding Officer already exists.");
      return;
    }
    this.openNodeModal("co", null, null);
  }

  addChildType(parent: HierarchyNode, childType: HierarchyNodeType): void {
    if (childType === "sailor") {
      this.openAddSailorModal(parent);
    } else {
      this.openNodeModal(childType, parent.dbId, null, parent);
    }
  }

  addChild(parent: HierarchyNode): void {
    const types = this.availableChildTypes(parent);
    if (!types.length) return;
    this.openNodeModal(types[0], parent.dbId, null, parent);
  }

  editNode(node: HierarchyNode): void {
    this.openNodeModal(node.type, null, node);
  }

  private async openNodeModal(
    type: HierarchyNodeType,
    parentDbId: number | null,
    editing: HierarchyNode | null,
    parentNode?: HierarchyNode | null,
  ): Promise<void> {
    const resolvedParentDbId =
      parentDbId ?? (editing?.dbId ? this.findParentNode(editing.dbId)?.dbId ?? null : null);
    this.modalNodeType.set(type);
    this.modalParentDbId.set(resolvedParentDbId);
    this.modalEditingNode.set(editing);

    let pType: HierarchyNodeType | null = null;
    if (parentNode) {
      pType = parentNode.type;
    } else if (parentDbId) {
      const pNode = this.findNodeByDbId(parentDbId);
      pType = pNode?.type ?? null;
    } else if (editing?.dbId) {
      const pNode = this.findParentNode(editing.dbId);
      pType = pNode?.type ?? null;
    }

    this.modalParentType.set(pType);
    this.modalIsDepartmentalOfficer.set(!!editing?.isDepartmentalOfficer);
    this.modalDivisionName.set(editing?.divisionName || "");
    this.modalSelectedUserId.set(editing?.selectedUserId ?? null);
    this.modalAdditionalDuty.set(editing?.additionalDuty || "");
    this.modalPhotoFile.set(null);
    this.modalPhotoPreview.set(editing?.photoUrl || null);
    this.modalPhotoRemoved.set(false);
    this.modalError.set("");
    this.modalUsers.set([]);
    this.showNodeModal.set(true);

    if (type !== "division") {
      try {
        const contextUsers = usersForHierarchyType(this.hierarchyContext(), type);
        let users: AvailableUser[] = contextUsers.map((u: RawAvailableUser) => ({
          id: this.normalizeUserId(u.id) ?? 0,
          name: u.name || u.full_name || u.username || '',
          rank: u.rank || '',
          designation: u.designation || '',
          personal_number: u.personal_number || '',
          photo: u.photo || '',
        })).filter((user) => !this.isUserInHierarchy(user, editing));

        if (editing) {
          let matched = users.find(
            (u) =>
              (editing.selectedUserId !== null && u.id === editing.selectedUserId) ||
              (u.name && editing.name && u.name.trim().toLowerCase() === editing.name.trim().toLowerCase()) ||
              (u.personal_number && editing.personalNumber && u.personal_number.trim().toLowerCase() === editing.personalNumber.trim().toLowerCase())
          );

          if (!matched && (editing.name || editing.personalNumber)) {
            const fallbackId = editing.selectedUserId ?? (editing.dbId ? -editing.dbId : -999);
            matched = {
              id: fallbackId,
              name: editing.name,
              rank: editing.rank,
              designation: editing.designation,
              personal_number: editing.personalNumber,
              photo: editing.photoUrl || "",
            };
            users = [matched, ...users];
          }

          if (matched) {
            this.modalSelectedUserId.set(matched.id);
          }
        }

        this.modalUsers.set(users);
      } catch {
        this.notify.error("Failed to load available personnel.");
      }
    }
  }

  closeNodeModal(): void {
    this.showNodeModal.set(false);
    this.modalNodeType.set(null);
    this.modalEditingNode.set(null);
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.modalPhotoFile.set(file);
    this.modalPhotoRemoved.set(false);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => this.modalPhotoPreview.set(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  removePhoto(): void {
    this.modalPhotoFile.set(null);
    this.modalPhotoPreview.set(null);
    this.modalPhotoRemoved.set(true);
  }

  selectedUserDetails(): AvailableUser | undefined {
    const selectedId = this.modalSelectedUserId();
    if (selectedId !== null) {
      const user = this.modalUsers().find((u) => u.id === selectedId);
      if (user) return user;
    }

    const editing = this.modalEditingNode();
    if (editing && editing.type !== "division") {
      return {
        id: editing.selectedUserId || 0,
        name: editing.name,
        rank: editing.rank,
        designation: editing.designation,
        personal_number: editing.personalNumber,
        photo: editing.photoUrl || "",
      };
    }

    return undefined;
  }

  async saveNode(): Promise<void> {
    const type = this.modalNodeType();
    if (!type) return;

    if (type === "division") {
      if (!this.modalDivisionName().trim()) {
        this.modalError.set("Division name is required.");
        return;
      }
    } else if (!this.modalSelectedUserId()) {
      this.modalError.set("Please select a name.");
      return;
    } else if (this.hierarchyUsersInUse(this.modalEditingNode()).has(this.modalSelectedUserId()!)) {
      this.modalError.set("This user is already assigned in the divisional organisation.");
      return;
    }

    const formData = new FormData();
    formData.append("node_type", type);
    formData.append("division_name", type === "division" ? this.modalDivisionName().trim() : "");
    formData.append("is_regulator", "0");
    formData.append("user_id", String(type === "division" ? 0 : (this.modalSelectedUserId() ?? 0)));
    const parentDbId = this.modalParentDbId();
    if (parentDbId !== null && parentDbId !== undefined) {
      formData.append("parent", String(parentDbId));
    }
    const editingNodeDbId = this.modalEditingNode()?.dbId;
    if (editingNodeDbId !== null && editingNodeDbId !== undefined) {
      formData.append("node_db_id", String(editingNodeDbId));
    }
    formData.append("is_commander_officer", type === "co" ? "1" : "0");
    formData.append("is_departmental_officer", this.modalIsDepartmentalOfficer() ? "1" : "0");
    formData.append("remove_photo", this.modalPhotoRemoved() ? "1" : "0");
    formData.append("designation", type === "division" ? "" : (this.selectedUserDetails()?.designation ?? ""));
    formData.append("additional_duty", type === "division" ? "" : this.modalAdditionalDuty().trim());
    formData.append("date", new Date().toISOString());

    if (this.modalPhotoRemoved()) {
      formData.append("photo", "");
    } else if (this.modalPhotoFile()) {
      formData.append("photo", this.modalPhotoFile()!);
    }

    this.saving.set(true);
    try {
      await firstValueFrom(this.homeApi.saveShipHierarchy(formData));
      this.closeNodeModal();
      await this.loadHierarchy();
    } catch {
    } finally {
      this.saving.set(false);
    }
  }

  readonly pendingDeleteNode = signal<HierarchyNode | null>(null);

  deleteNode(node: HierarchyNode, event?: Event): void {
    event?.stopPropagation();
    if (!node.dbId) return;
    this.pendingDeleteNode.set(node);
  }

  async confirmDeleteNode(): Promise<void> {
    const node = this.pendingDeleteNode();
    if (!node || !node.dbId) return;
    this.pendingDeleteNode.set(null);

    const currentDivDbId = this.sailorModalDivision()?.dbId;

    try {
      await firstValueFrom(this.homeApi.deleteHierarchyNode(node.dbId));
      await this.loadHierarchy();

      if (currentDivDbId && this.showSailorModal()) {
        const updatedDiv = this.findNodeByDbId(currentDivDbId);
        if (updatedDiv) {
          this.sailorModalDivision.set({ ...updatedDiv });
        }
      }
    } catch {
      this.notify.error("Failed to delete.");
    }
  }

  cancelDeleteNode(): void {
    this.pendingDeleteNode.set(null);
  }

  // ── Sailor list modal (per division) ───────────────────────────────
  openSailorModal(division: HierarchyNode, event: Event): void {
    event.stopPropagation();
    this.sailorModalDivision.set(division);
    this.sailorSearchText.set("");
    this.sailorPageSize.set(10);
    this.sailorCurrentPage.set(1);
    this.sailorSortField.set("name");
    this.sailorSortOrder.set("asc");
    this.showSailorModal.set(true);
  }

  closeSailorModal(): void {
    this.showSailorModal.set(false);
    this.sailorModalDivision.set(null);
  }

  toggleSailorSort(field: string): void {
    if (this.sailorSortField() === field) {
      this.sailorSortOrder.set(this.sailorSortOrder() === "asc" ? "desc" : "asc");
    } else {
      this.sailorSortField.set(field);
      this.sailorSortOrder.set("asc");
    }
  }

  clearSailorFilters(): void {
    this.sailorSearchText.set("");
    this.sailorPageSize.set(10);
    this.sailorCurrentPage.set(1);
  }

  onSailorPageSizeChange(val: string | number): void {
    this.sailorPageSize.set(Number(val));
    this.sailorCurrentPage.set(1);
  }

  setSailorPage(page: number): void {
    if (page >= 1 && page <= this.totalSailorPages()) {
      this.sailorCurrentPage.set(page);
    }
  }

  printSailorList(): void {
    window.print();
  }

  async toggleSailorRegulator(sailor: HierarchyNode, checked: boolean): Promise<void> {
    if (!sailor.dbId) return;
    try {
      await firstValueFrom(this.homeApi.toggleSailorRegulator(sailor.dbId, checked));
      sailor.isRegulator = checked;
      // this.notify.success("Regulator status updated.");
    } catch {
      // this.notify.error("Failed to update regulator status.");
    }
  }

  // ── Add sailor(s) to a division ─────────────────────────────────────
  onAddSailorPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.addSailorPhotoFile.set(file);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.do-chip-select-box') && !target.closest('.do-select-dropdown')) {
      this.addSailorDropdownOpen.set(false);
    }
  }

  toggleAddSailorDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.addSailorDropdownOpen.set(!this.addSailorDropdownOpen());
  }

  openAddSailorDropdown(): void {
    this.addSailorDropdownOpen.set(true);
  }

  isSailorSelected(user: AvailableUser): boolean {
    return this.addSailorSelectedRows().some((u) => u.id === user.id);
  }

  toggleSailorSelection(user: AvailableUser): void {
    const current = this.addSailorSelectedRows();
    const exists = current.some((u) => u.id === user.id);
    if (exists) {
      this.addSailorSelectedRows.set(current.filter((u) => u.id !== user.id));
    } else {
      this.addSailorSelectedRows.set([...current, user]);
    }
  }

  removeSailorChip(user: AvailableUser, event: MouseEvent): void {
    event.stopPropagation();
    this.addSailorSelectedRows.set(
      this.addSailorSelectedRows().filter((u) => u.id !== user.id)
    );
  }

  clearAllSelectedSailors(event: MouseEvent): void {
    event.stopPropagation();
    this.addSailorSelectedRows.set([]);
  }

  toggleSelectAllSailors(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      const currentMap = new Map(this.addSailorSelectedRows().map((u) => [u.id, u]));
      this.addSailorFilteredUsers().forEach((u) => currentMap.set(u.id, u));
      this.addSailorSelectedRows.set(Array.from(currentMap.values()));
    } else {
      const filteredIds = new Set(this.addSailorFilteredUsers().map((u) => u.id));
      this.addSailorSelectedRows.set(
        this.addSailorSelectedRows().filter((u) => !filteredIds.has(u.id))
      );
    }
  }

  async openAddSailorModal(division: HierarchyNode): Promise<void> {
    this.addSailorDivision.set(division);
    this.addSailorSearch.set("");
    this.addSailorSelectedRows.set([]);
    this.addSailorPhotoFile.set(null);
    this.addSailorDropdownOpen.set(false);
    this.showAddSailorModal.set(true);
    try {
      const contextUsers = usersForHierarchyType(this.hierarchyContext(), "sailor");
      const users: AvailableUser[] = contextUsers.map((u: RawAvailableUser) => ({
        id: this.normalizeUserId(u.id) ?? 0,
        name: u.name || u.full_name || u.username || '',
        rank: u.rank || '',
        designation: u.designation || '',
        personal_number: u.personal_number || '',
        photo: u.photo || '',
      })).filter((user) => !this.isUserInHierarchy(user));
      this.addSailorUsers.set(users);
    } catch {
      this.notify.error("Failed to load available personnel.");
    }
  }

  closeAddSailorModal(): void {
    this.showAddSailorModal.set(false);
    this.addSailorDivision.set(null);
    this.addSailorPhotoFile.set(null);
    this.addSailorDropdownOpen.set(false);
  }

  async confirmAddSailors(): Promise<void> {
    const division = this.addSailorDivision();
    const selected = this.addSailorSelectedRows();
    if (!division?.dbId || selected.length === 0) return;

    this.saving.set(true);
    try {
      const photo = this.addSailorPhotoFile();
      if (selected.length === 1 && photo) {
        const formData = new FormData();
        formData.set("node_type", "sailor");
        formData.set("parent", String(division.dbId));
        formData.set("user", String(selected[0].id));
        formData.append("photo", photo);
        await firstValueFrom(this.homeApi.createHierarchyNode(formData));
      } else {
        await firstValueFrom(
          this.homeApi.addSailorsBulk({
            division_id: division.dbId,
            user_ids: selected.map((u) => u.id),
          }),
        );
      }
      this.closeAddSailorModal();
      await this.loadHierarchy();

      if (division.dbId && this.showSailorModal()) {
        const updatedDiv = this.findNodeByDbId(division.dbId);
        if (updatedDiv) {
          this.sailorModalDivision.set({ ...updatedDiv });
        }
      }
    } catch {
      this.notify.error("Failed to add sailor(s).");
    } finally {
      this.saving.set(false);
    }
  }

}
