# Frontend PDF Highlighting Integration Guide

## 🎯 Purpose

This guide explains how to implement **precise PDF highlighting** in the Graphex frontend using the coordinate-based references provided by the backend.

**User requirement**: "Be careful, we want the highlight to be precise (looks regularized, do not touch unrelated text)"

---

## 📡 New API Response Structure

### GET /api/v1/documents/:id

**Response now includes `metadata.textBlocks`**:

```json
{
  "success": true,
  "data": {
    "id": "doc123",
    "title": "Machine Learning Paper",
    "contentText": "Full document text...",
    "metadata": {
      "textBlocks": [
        {
          "text": "Machine learning is a subset of artificial intelligence...",
          "page": 0,
          "bbox": {
            "x": 72,
            "y": 720,
            "width": 400,
            "height": 24
          }
        }
      ],
      "pageCount": 10,
      "wordCount": 5000
    }
  }
}
```

### GET /api/v1/graphs/:id

**Response now includes coordinate-based `documentRefs` in nodes**:

```json
{
  "success": true,
  "data": {
    "id": "graph123",
    "nodes": [
      {
        "id": "node123",
        "nodeKey": "A",
        "title": "Machine Learning",
        "summary": "A branch of AI that enables computers to learn...",
        "documentRefs": {
          "references": [
            {
              "text": "Machine learning is a subset of artificial intelligence",
              "page": 0,
              "bbox": {
                "x": 72,
                "y": 720,
                "width": 400,
                "height": 24
              }
            },
            {
              "text": "Later section discussing machine learning applications",
              "page": 5,
              "bbox": {
                "x": 100,
                "y": 650,
                "width": 380,
                "height": 20
              }
            }
          ]
        }
      }
    ]
  }
}
```

**Key points**:
- Nodes can have **multiple references** (same concept on different pages)
- Each reference has `text`, `page` (0-indexed), and `bbox` (bounding box)
- `bbox` coordinates use **PDF coordinate system** (origin at bottom-left)

---

## 🖼️ PDF Coordinate System (CRITICAL!)

### Coordinate System Differences

| System | Origin | Y-Axis Direction |
|--------|--------|------------------|
| **PDF** (what backend returns) | Bottom-left | Increases **upward** ↑ |
| **Canvas/Screen** (what you render) | Top-left | Increases **downward** ↓ |

**You MUST convert coordinates before rendering!**

```typescript
// Convert PDF coordinates to Canvas coordinates
function pdfToCanvasY(pdfY: number, pdfHeight: number, pageHeight: number): number {
  return pageHeight - pdfY - pdfHeight;
}
```

### Example Conversion

```typescript
// Backend provides (PDF coordinate system):
const bbox = {
  x: 72,       // 72 points from left (1 inch)
  y: 720,      // 720 points from bottom
  width: 400,
  height: 24
};

// If page height is 792 points (letter size):
const pageHeight = 792;

// Convert to canvas coordinates:
const canvasY = pageHeight - bbox.y - bbox.height; // 792 - 720 - 24 = 48

// Draw highlight:
ctx.fillRect(bbox.x, canvasY, bbox.width, bbox.height);
// Result: Highlight at (72, 48) - correct position!
```

---

## 🎨 Expected UI Behavior

### User Clicks a Node in the Graph

**Immediate reactions (all simultaneous)**:

1. **Reading panel scrolls to first reference**:
   - Smooth scroll animation (800ms ease-in-out)
   - Target: page containing first reference
   - Position: Scroll so highlighted text is in viewport center

2. **Highlight corresponding text with precise bounding box**:
   - Color: Warm amber (`#D4A574`) with opacity 0.3
   - Duration: Fade in over 2 seconds
   - Multiple highlights: If node has references on multiple pages
   - Precision: Highlight ONLY the text, no unrelated content

3. **Note panel slides in from bottom-left**:
   - Position: Fixed overlay at bottom-left corner
   - Size: 300px × 400px
   - Animation: Slide up from bottom (400ms ease-out)
   - Shadow: `0 4px 12px rgba(0,0,0,0.15)`
   - Auto-focus on text input

4. **Node gets active border**:
   - Color: Deep teal (`#2C5F6F`)
   - Width: 2px solid

### While Note Panel is Open

- Highlight remains visible (maintains amber background)
- User can scroll through document
- Highlight stays in place (absolute positioning)

### When Note Panel Closes

1. Panel slides back down (400ms ease-in)
2. Highlight fades out
3. Node gains small amber dot indicator (bottom-right corner) showing it has notes

---

## 🔧 Implementation Steps

### Step 1: Fetch Document with Text Blocks

```typescript
async function loadDocument(documentId: string) {
  const response = await fetch(`/api/v1/documents/${documentId}`);
  const { data } = await response.json();

  return {
    contentText: data.contentText,
    textBlocks: data.metadata?.textBlocks || [],
    pageCount: data.metadata?.pageCount || 1
  };
}
```

### Step 2: Render PDF with PDF.js

```typescript
import * as pdfjsLib from 'pdfjs-dist';

async function renderPDF(pdfUrl: string, containerEl: HTMLElement) {
  const pdf = await pdfjsLib.getDocument(pdfUrl).promise;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.dataset.pageNumber = String(pageNum - 1); // 0-indexed

    containerEl.appendChild(canvas);

    await page.render({
      canvasContext: canvas.getContext('2d')!,
      viewport
    }).promise;
  }
}
```

### Step 3: Handle Node Click → Highlight

```typescript
interface NodeDocumentReference {
  text: string;
  page: number;
  bbox: { x: number; y: number; width: number; height: number };
}

function onNodeClick(node: GraphNode) {
  const references = node.documentRefs?.references || [];

  if (references.length === 0) return;

  // 1. Scroll to first reference
  scrollToPage(references[0].page);

  // 2. Highlight all references
  references.forEach(ref => {
    highlightTextRegion(ref);
  });

  // 3. Show note panel
  showNotePanel(node);

  // 4. Mark node as active
  markNodeActive(node.id);
}
```

### Step 4: Implement Precise Highlighting

```typescript
function highlightTextRegion(ref: NodeDocumentReference) {
  // Find the canvas for this page
  const canvas = document.querySelector(`canvas[data-page-number="${ref.page}"]`) as HTMLCanvasElement;
  if (!canvas) return;

  // Get canvas context
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Get page height (in PDF points)
  const pageHeight = canvas.height / 1.5; // Divide by scale

  // CRITICAL: Convert PDF coordinates to canvas coordinates
  const canvasX = ref.bbox.x * 1.5; // Scale to match canvas
  const canvasY = (pageHeight - ref.bbox.y - ref.bbox.height) * 1.5;
  const canvasWidth = ref.bbox.width * 1.5;
  const canvasHeight = ref.bbox.height * 1.5;

  // Draw highlight (warm amber with transparency)
  ctx.fillStyle = 'rgba(212, 165, 116, 0.3)'; // #D4A574 with 30% opacity
  ctx.fillRect(canvasX, canvasY, canvasWidth, canvasHeight);

  // Optional: Draw border for extra emphasis
  ctx.strokeStyle = 'rgba(212, 165, 116, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(canvasX, canvasY, canvasWidth, canvasHeight);
}
```

### Step 5: Smooth Scroll to Page

```typescript
function scrollToPage(pageNumber: number) {
  const canvas = document.querySelector(`canvas[data-page-number="${pageNumber}"]`);
  if (!canvas) return;

  // Scroll so the canvas is in the center of the viewport
  canvas.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest'
  });
}
```

### Step 6: Handle Multiple References

```typescript
// If a node has references on multiple pages, highlight all of them
function highlightAllReferences(references: NodeDocumentReference[]) {
  references.forEach((ref, index) => {
    // Stagger highlight animations slightly
    setTimeout(() => {
      highlightTextRegion(ref);
    }, index * 100); // 100ms delay between each
  });
}
```

---

## ⚠️ Important Notes

### 1. PDF Coordinate System

**Never forget**: PDF origin is at BOTTOM-LEFT, not TOP-LEFT!

```typescript
// ❌ WRONG - Will highlight wrong location
ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);

// ✅ CORRECT - Converts PDF coords to canvas coords
const canvasY = pageHeight - bbox.y - bbox.height;
ctx.fillRect(bbox.x, canvasY, bbox.width, bbox.height);
```

### 2. Scaling

If you render PDFs at scale !== 1.0, multiply coordinates:

```typescript
const scale = 1.5; // Your rendering scale
const canvasX = bbox.x * scale;
const canvasY = (pageHeight - bbox.y - bbox.height) * scale;
const canvasWidth = bbox.width * scale;
const canvasHeight = bbox.height * scale;
```

### 3. Canvas vs. HTML Overlays

**Option A: Draw on canvas** (what code above shows)
- Pro: Simpler, no DOM elements
- Con: Harder to animate, no CSS effects

**Option B: HTML overlay divs**
```typescript
function highlightWithHTML(ref: NodeDocumentReference) {
  const overlay = document.createElement('div');
  overlay.className = 'pdf-highlight';
  overlay.style.position = 'absolute';
  overlay.style.left = `${ref.bbox.x}px`;
  overlay.style.top = `${pageHeight - ref.bbox.y - ref.bbox.height}px`;
  overlay.style.width = `${ref.bbox.width}px`;
  overlay.style.height = `${ref.bbox.height}px`;
  overlay.style.backgroundColor = 'rgba(212, 165, 116, 0.3)';
  overlay.style.border = '2px solid rgba(212, 165, 116, 0.6)';
  overlay.style.transition = 'opacity 2s';

  canvasContainer.appendChild(overlay);
}
```

### 4. No Coordinates Available?

Some nodes might not have coordinates (fallback case):

```typescript
function onNodeClick(node: GraphNode) {
  const references = node.documentRefs?.references || [];

  if (references.length === 0) {
    // Fallback: Search for text in document
    const text = node.summary || node.title;
    searchAndHighlight(text); // Your existing text search
    return;
  }

  // Use coordinate-based highlighting
  highlightAllReferences(references);
}
```

---

## 🎯 Success Criteria

**Highlighting is considered "precise" when**:

1. ✅ Bounding box matches text exactly (no extra whitespace)
2. ✅ Unrelated text is NOT touched
3. ✅ Multi-line highlights work correctly
4. ✅ Highlights are visually clean (regularized appearance)
5. ✅ Page references are accurate
6. ✅ Scrolling brings highlighted text into view
7. ✅ Multiple highlights don't overlap incorrectly

**Test with**:
- Academic papers (multi-column layouts)
- Different page sizes (Letter, A4)
- Multi-page concepts (same term on pages 3, 7, 12)
- Edge cases (text near page boundaries)

---

## 🧪 Testing Checklist

- [ ] Upload a multi-page PDF
- [ ] Generate graph
- [ ] Click node → Verify scroll to correct page
- [ ] Verify highlight appears on correct text
- [ ] Verify highlight looks "regularized" (no stray highlights)
- [ ] Verify note panel appears simultaneously
- [ ] Verify multiple references highlight on different pages
- [ ] Test with different PDF scales (1.0, 1.5, 2.0)
- [ ] Test with different page sizes
- [ ] Verify closing note panel removes highlights

---

## 📚 Additional Resources

- **Backend Documentation**: `/docs/NODE_COORDINATE_REFERENCES.md`
- **PDF.js Documentation**: https://mozilla.github.io/pdf.js/
- **Coordinate System Reference**: `/src/lib/pdf/META.md`
- **Type Definitions**: `/src/types/node.types.ts`

---

## 🐛 Troubleshooting

### Highlights appear in wrong location

**Cause**: Forgot to convert PDF Y-coordinate to canvas Y-coordinate

**Fix**: Use `pageHeight - pdfY - pdfHeight`

### Highlights are offset

**Cause**: Scale mismatch between PDF rendering and coordinate calculation

**Fix**: Apply same scale factor to both rendering and highlighting

### No highlights appear

**Causes**:
1. `documentRefs` is null or empty → Check backend graph generation
2. Wrong canvas selector → Verify `data-page-number` attribute
3. Coordinates outside page bounds → Check backend extraction logs

### Highlights look "messy"

**Cause**: Individual text items not combined properly

**Fix**: Backend quote matcher should combine adjacent blocks. If issue persists, report to backend team.

---

**Status**: ✅ Backend provides all necessary data for precise PDF highlighting
**Last Updated**: 2025-11-15
**Contact**: Backend team for coordinate extraction issues
