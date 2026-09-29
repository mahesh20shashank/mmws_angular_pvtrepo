import { ButtonComponent } from '../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { Call } from "../../../Core/http/services/call";
import { HomeApi } from "../services/home-api";
import { NotificationService } from "../../../Core/services/notification/notification.service";
import { ModalComponent } from "../../../shared/components/modal/modal.component";
import { GalleryImage } from "./gallery.model";
import { DepartmentMaster } from "../department-master/department-master.model";
import { IconComponent } from "../../../shared/components";
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

@Component({
  selector: "app-gallery",
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, IconComponent, HelpGuidance, ConfirmDeleteModal, ButtonComponent],
  templateUrl: "./gallery.html",
  styleUrl: "./gallery.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Gallery implements OnInit {
  private readonly call = inject(Call);
  private readonly homeApi = inject(HomeApi);
  private readonly notify = inject(NotificationService);
  readonly helpHtml = HELP_HTML;
  readonly loading = signal(true);
  readonly isEditMode = signal(false);
  readonly images = signal<GalleryImage[]>([]);
  readonly departments = signal<DepartmentMaster[]>([]);
  readonly selectedDepartment = signal<number | null>(null);

  readonly filteredImages = computed(() => {
    const dept = this.selectedDepartment();
    if (dept === null) return this.images();
    return this.images().filter(img => img.department === dept);
  });

  readonly showViewer = signal(false);
  readonly activeIndex = signal(0);

  readonly showUploadModal = signal(false);
  readonly uploadTitle = signal("");
  readonly uploadCaption = signal("");
  readonly uploadDepartment = signal<number | null>(null);
  readonly uploadFile = signal<File | null>(null);
  readonly uploadPreview = signal<string | null>(null);
  readonly uploadError = signal("");
  readonly saving = signal(false);

  ngOnInit(): void {
    this.loadDepartments();
    this.loadImages();
  }

  async loadDepartments(): Promise<void> {
    try {
      const res = await firstValueFrom(this.call.getDepartments());
      this.departments.set(res || []);
    } catch {
      this.departments.set([]);
    }
  }

  async loadImages(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.call.getGalleryData());
      this.images.set(res || []);
    } catch {
      this.notify.error("Failed to load gallery images.");
    } finally {
      this.loading.set(false);
    }
  }

  selectDepartment(deptId: number | null): void {
    this.selectedDepartment.set(deptId);
  }

  setUploadDepartment(value: string): void {
    this.uploadDepartment.set(value ? Number(value) : null);
  }

  toggleMode(): void {
    this.isEditMode.set(!this.isEditMode());
  }

  openViewer(index: number): void {
    this.activeIndex.set(index);
    this.showViewer.set(true);
  }

  resetActiveIndex(): void {
    const count = this.filteredImages().length;
    if (count > 0) {
      this.activeIndex.set(0);
    }
  }

  closeViewer(): void {
    this.showViewer.set(false);
  }

  prevImage(): void {
    const count = this.filteredImages().length;
    if (count === 0) return;
    this.activeIndex.set((this.activeIndex() - 1 + count) % count);
  }

  nextImage(): void {
    const count = this.filteredImages().length;
    if (count === 0) return;
    this.activeIndex.set((this.activeIndex() + 1) % count);
  }

  activeImage(): GalleryImage | null {
    return this.filteredImages()[this.activeIndex()] ?? null;
  }

  openUploadModal(): void {
    this.uploadTitle.set("");
    this.uploadCaption.set("");
    this.uploadDepartment.set(null);
    this.uploadFile.set(null);
    this.uploadPreview.set(null);
    this.uploadError.set("");
    this.showUploadModal.set(true);
  }

  closeUploadModal(): void {
    this.showUploadModal.set(false);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.uploadFile.set(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => this.uploadPreview.set(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  async uploadImage(): Promise<void> {
    if (!this.uploadDepartment()) {
      this.uploadError.set("Department is required.");
      return;
    }
    if (!this.uploadTitle().trim()) {
      this.uploadError.set("Title is required.");
      return;
    }
    if (!this.uploadFile()) {
      this.uploadError.set("Please choose an image.");
      return;
    }

    const formData = new FormData();
    formData.set("title", this.uploadTitle().trim());
    formData.set("caption", this.uploadCaption().trim());
    formData.set("department", this.uploadDepartment()!.toString());
    formData.append("image", this.uploadFile()!);

    this.saving.set(true);
    try {
      await firstValueFrom(this.homeApi.createGalleryImage(formData));
      this.closeUploadModal();
      await this.loadImages();
      this.resetActiveIndex();
    } catch {
      this.notify.error("Failed to upload image.");
    } finally {
      this.saving.set(false);
    }
  }

  readonly pendingDeleteImage = signal<GalleryImage | null>(null);

  deleteImage(image: GalleryImage, event: Event): void {
    event.stopPropagation();
    this.pendingDeleteImage.set(image);
  }

  async confirmDeleteImage(): Promise<void> {
    const image = this.pendingDeleteImage();
    if (!image) return;
    this.pendingDeleteImage.set(null);

    try {
      await firstValueFrom(this.homeApi.deleteGalleryImage(image.id));
      this.notify.success("Image deleted.");
      await this.loadImages();
      this.resetActiveIndex();
    } catch {
      this.notify.error("Failed to delete image.");
    }
  }

  cancelDeleteImage(): void {
    this.pendingDeleteImage.set(null);
  }
}
