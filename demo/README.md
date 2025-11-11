# Graphex MVP Demo

This is a fully functional HTML demo of the Graphex MVP (Minimum Viable Product) stage, implementing the 5 core features defined in the product requirements.

## Features Implemented

### ✅ Feature 1: Basic Graph Generation & Display
- Interactive Mermaid.js knowledge graph visualization
- Nodes represent key concepts with clean, modern styling
- Directed edges show relationships between concepts
- Zoom controls and fit-to-screen functionality

### ✅ Feature 2: Integrated Reading Interface
- Side-by-side layout: graph (60%) + reading panel (40%)
- Click nodes to jump to corresponding sections
- Smooth scrolling with highlighted passages
- Maintains context while navigating

### ✅ Feature 3: Node Notes (Basic)
- Click nodes to open note-taking modal
- Word count tracking
- Auto-save status indicators
- Notes stored in browser state

### ✅ Feature 4: Pre-Explanation Retrieval (CRITICAL)
- Click connections between nodes to explore relationships
- **Must generate hypothesis first** (minimum 50 characters)
- AI explanation revealed only after user's hypothesis
- Source text references provided
- Self-explanation prompt after AI explanation

### ✅ Feature 5: Basic Comprehension Check
- Quiz triggered after 5 node interactions
- 5 multiple-choice questions based on document content
- Immediate feedback with explanations
- Results summary with concepts to review
- Visual progress tracking

## Design Implementation

The demo follows the UI/UX specifications from [UIUX.md](../META/Core/UIUX.md):

- **Color Palette**: "Intellectual Serenity" with warm neutrals (off-white background, deep teal accents, warm amber highlights)
- **Typography**: Inter for UI, Charter/Georgia for reading content
- **Spacing**: 8px base unit grid system for visual rhythm
- **Animations**: Purposeful, 200-400ms transitions, smooth and intentional
- **Voice**: "Knowledgeable Friend" - intelligent but not condescending

## Getting Started

### Option 1: Open Directly
Simply open `index.html` in a modern web browser:
```bash
open demo/index.html
# or
open -a "Google Chrome" demo/index.html
```

### Option 2: Use a Local Server
For best experience, serve with a local server:
```bash
# Python 3
cd demo
python -m http.server 8000

# Node.js (http-server)
npx http-server demo -p 8000
```

Then navigate to `http://localhost:8000`

## Using the Demo

### 1. Load Sample Document
- Click "Or try a sample document" on the empty state
- Watch the loading animation (simulates document processing)
- The sample document is "The Learning Pyramid: A Cognitive Science Perspective"

### 2. Explore the Graph
- **Click nodes** to read corresponding content in the right panel
- Content auto-scrolls and highlights the relevant section
- Right-click nodes (or regular click) to add notes

### 3. Understand Connections
- **Click the lines** (edges) between nodes
- You'll be prompted to write your hypothesis (min 50 chars)
- Submit to see AI's explanation and source references
- Write your own explanation to consolidate learning

### 4. Take Notes
- Click any node to open the note modal
- Write notes in your own words (prevents copy-paste from source)
- Notes are saved automatically

### 5. Test Your Understanding
- After exploring 5 nodes, a quiz banner appears
- 5 questions test comprehension and relationships
- Get immediate feedback and see concepts to review
- View results summary with your score

## Sample Content

The demo includes a sample article about cognitive learning principles:
- **8 concepts**: Active Learning, Testing Effect, Elaborative Encoding, Spaced Repetition, Metacognition, Generation Effect, Dual Coding, Synthesis
- **12 connections** explaining relationships between concepts
- **5 quiz questions** testing understanding
- All content is based on real cognitive science research

## Technical Details

### Dependencies
- **Mermaid.js** (CDN): For graph rendering
- Pure vanilla JavaScript (no frameworks)
- CSS3 with CSS variables for theming
- No backend required (all state in browser)

### Browser Compatibility
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

### File Structure
```
demo/
├── index.html          # Main HTML structure
├── styles.css          # Complete design system + styling
├── app.js              # All application logic
└── README.md          # This file
```

## Key Interactions

### Graph Interactions
- **Click node**: Navigate to content
- **Click edge**: Explore connection (pre-explanation retrieval)
- **Zoom controls**: +, -, and fit-to-screen buttons

### Modals
- **Note Modal**: Triggered by node click
- **Connection Modal**: Two-step process (hypothesis → explanation)
- **Quiz Modal**: Question-by-question flow
- **Results Modal**: Final score and review recommendations

### Toast Notifications
- Success, error, and info messages
- Auto-dismiss after 4 seconds
- Slide in from top-right

## Cognitive Science Principles

The demo embodies these learning principles:

1. **Active Learning**: Users must engage, not passively read
2. **Pre-Retrieval**: Generate hypotheses before seeing answers
3. **Testing Effect**: Quiz reinforces retention
4. **Generation Effect**: Write notes in own words
5. **Dual Coding**: Visual graph + textual content
6. **Metacognition**: Self-awareness through quiz results

## Limitations (By Design - MVP Scope)

The following are intentionally excluded from MVP:

- ❌ Real document upload/parsing (sample document only)
- ❌ Backend/database (browser storage only)
- ❌ Spaced repetition scheduling
- ❌ Multi-document synthesis
- ❌ Skeleton graphs (only full AI-generated)
- ❌ Graph customization/rearrangement
- ❌ User accounts and persistence
- ❌ Collaborative features

These will be added in post-MVP iterations.

## Next Steps (Post-MVP)

Based on [MVP.md](../META/Core/MVP.md), the recommended priority is:

1. **Weeks 3-4**: Spaced repetition system (high cognitive impact)
2. **Weeks 5-6**: Multi-document synthesis (key differentiator)
3. **Weeks 7-8**: Skeleton graphs + customization
4. **Weeks 9+**: Metacognitive features, collaboration

## Customization

### Changing Colors
Edit CSS variables in `styles.css`:
```css
:root {
    --color-primary: #2C5F6F;     /* Change primary color */
    --color-secondary: #D4A574;    /* Change accent color */
    /* ... more variables */
}
```

### Adding New Content
Edit `SAMPLE_DOCUMENT` in `app.js`:
- `title`: Document title
- `content`: HTML content with section IDs
- `graph`: Mermaid graph syntax
- `nodes`: Maps graph nodes to content sections
- `connections`: Explains relationships

### Adding Quiz Questions
Add to `QUIZ_QUESTIONS` array in `app.js`:
```javascript
{
    question: "Your question here?",
    options: ["Option 1", "Option 2", "Option 3", "Option 4"],
    correct: 1, // Zero-indexed
    explanation: "Why this is correct...",
    relatedNode: 'NodeID'
}
```

## Design Principles

Following the product philosophy:

1. **Calm, Not Colorful**: Sophisticated neutrals, purposeful accents
2. **Clear, Not Clever**: Direct communication over wit
3. **Smooth, Not Showy**: Animations guide, don't entertain
4. **Spacious, Not Sparse**: Generous whitespace aids focus
5. **Serious, Not Stuffy**: Professional but approachable
6. **Focused, Not Flashy**: Everything serves learning

## Feedback & Iteration

This demo is designed for:
- **User testing**: Get feedback on core learning loop
- **Stakeholder demos**: Show MVP vision and interactions
- **Development reference**: Guide for full implementation
- **Design validation**: Test UI/UX decisions

## Questions?

Refer to the core documentation:
- [PRODUCT.md](../META/Core/PRODUCT.md) - Full feature specifications
- [UIUX.md](../META/Core/UIUX.md) - Complete design system
- [MVP.md](../META/Core/MVP.md) - MVP scope and timeline

---

**Built with cognitive science principles at the core. Learning through active engagement, not passive consumption.**
