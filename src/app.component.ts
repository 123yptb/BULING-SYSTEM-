import { Component, OnInit, ChangeDetectionStrategy, signal, computed, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

declare var html2canvas: any;
declare var jspdf: any;

export interface InvoiceItem {
  description: string;
  quantity: number;
  price: number;
  unit: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  // Invoice Details
  invoiceNumber: WritableSignal<string> = signal('');
  invoiceDate: WritableSignal<string> = signal('');
  customerName: WritableSignal<string> = signal('John Doe');
  
  // Invoice Items
  items: WritableSignal<InvoiceItem[]> = signal([
    { description: 'Web Development Services', quantity: 10, price: 150, unit: 'hours' },
    { description: 'UI/UX Design Mockups', quantity: 5, price: 80, unit: 'mockups' },
  ]);

  // New Item Form
  newItemDescription: WritableSignal<string> = signal('');
  newItemQuantity: WritableSignal<number> = signal(0);
  newItemPrice: WritableSignal<number> = signal(0);
  newItemUnit: WritableSignal<string> = signal('');

  // Financials
  taxRate = signal(0); // 0%
  discountValue = signal(0);
  discountType = signal<'percentage' | 'fixed'>('percentage');
  showPrintPreview = signal(false);

  subtotal = computed(() => {
    return this.items().reduce((acc, item) => acc + item.quantity * item.price, 0);
  });

  discountAmount = computed(() => {
    const sub = this.subtotal();
    const type = this.discountType();
    const value = this.discountValue();

    if (type === 'percentage') {
      return sub * (value / 100);
    }
    return Math.min(sub, value); // Ensure fixed discount isn't more than subtotal
  });

  taxAmount = computed(() => {
    const taxableAmount = this.subtotal() - this.discountAmount();
    return taxableAmount * this.taxRate();
  });

  total = computed(() => {
    const taxableAmount = this.subtotal() - this.discountAmount();
    return taxableAmount + this.taxAmount();
  });

  ngOnInit() {
    this.generateNewInvoice();
  }

  generateNewInvoice() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    this.invoiceNumber.set(`INV-${year}${month}${day}-${hours}${minutes}${seconds}`);
    this.invoiceDate.set(now.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }));
    this.items.set([]);
    this.customerName.set('');
    this.resetNewItemForm();
    this.taxRate.set(0);
    this.discountValue.set(0);
    this.discountType.set('percentage');
  }

  addItem() {
    if (this.newItemDescription() && this.newItemQuantity() > 0 && this.newItemPrice() >= 0) {
      this.items.update(currentItems => [
        ...currentItems,
        {
          description: this.newItemDescription(),
          quantity: this.newItemQuantity(),
          price: this.newItemPrice(),
          unit: this.newItemUnit(),
        }
      ]);
      this.resetNewItemForm();
    }
  }

  removeItem(index: number) {
    this.items.update(currentItems => {
      const newItems = [...currentItems];
      newItems.splice(index, 1);
      return newItems;
    });
  }
  
  resetNewItemForm() {
      this.newItemDescription.set('');
      this.newItemQuantity.set(0);
      this.newItemPrice.set(0);
      this.newItemUnit.set('');
  }

  openPrintPreview() {
    this.showPrintPreview.set(true);
  }

  closePrintPreview() {
    this.showPrintPreview.set(false);
  }

  executePrint() {
    this.showPrintPreview.set(false);
    // Use a timeout to ensure the preview modal is gone before the print dialog opens
    setTimeout(() => window.print(), 100);
  }

  private async captureReceiptElement(): Promise<HTMLCanvasElement | null> {
    const receiptElement = document.getElementById('receipt-for-export');
    if (!receiptElement) {
      console.error('Receipt element for export not found!');
      return null;
    }

    // Temporarily make the element visible for capture
    const originalStyles = {
      position: receiptElement.style.position,
      left: receiptElement.style.left,
      display: receiptElement.style.display,
      width: receiptElement.style.width,
    };

    receiptElement.style.position = 'fixed';
    receiptElement.style.left = '-9999px';
    receiptElement.style.display = 'block';
    receiptElement.style.width = '400px'; // Match preview modal width

    try {
      const canvas = await html2canvas(receiptElement, {
        scale: 2, // Higher scale for better quality
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      return canvas;
    } catch (error) {
      console.error('Error capturing element:', error);
      return null;
    } finally {
      // Restore original styles
      receiptElement.style.position = originalStyles.position;
      receiptElement.style.left = originalStyles.left;
      receiptElement.style.display = originalStyles.display;
      receiptElement.style.width = originalStyles.width;
    }
  }

  async saveAsImage() {
    const canvas = await this.captureReceiptElement();
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `invoice-${this.invoiceNumber()}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async saveAsPdf() {
    const canvas = await this.captureReceiptElement();
    if (!canvas) return;

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    // A standard thermal receipt paper is ~80mm wide.
    // We scale the image to fit this width.
    const pdfWidth = 80;
    const pdfHeight = (imgHeight * pdfWidth) / imgWidth;
    
    const { jsPDF } = jspdf;
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: [pdfWidth, pdfHeight]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`invoice-${this.invoiceNumber()}.pdf`);
  }

  // Helper for template to avoid complex expressions
  getItemTotal(item: InvoiceItem): number {
    return item.quantity * item.price;
  }
}