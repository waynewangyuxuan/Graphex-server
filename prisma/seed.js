/**
 * Database Seed Script
 *
 * Populates the database with realistic sample data for development and testing.
 *
 * Run with: npm run prisma:seed
 * or: tsx prisma/seed.ts
 */
import { PrismaClient, DocumentStatus, SourceType, GraphStatus, QuizDifficulty } from '@prisma/client';
const prisma = new PrismaClient();
// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================
/**
 * Generates a sample Mermaid graph code
 */
function generateMermaidCode(nodeCount) {
    const nodes = Array.from({ length: nodeCount }, (_, i) => {
        const id = String.fromCharCode(65 + i); // A, B, C, ...
        return `    ${id}[Concept ${i + 1}]`;
    });
    const edges = [];
    for (let i = 0; i < nodeCount - 1; i++) {
        const from = String.fromCharCode(65 + i);
        const to = String.fromCharCode(65 + i + 1);
        edges.push(`    ${from} --> ${to}`);
    }
    // Add some cross-connections
    if (nodeCount > 3) {
        edges.push(`    A --> C`);
    }
    if (nodeCount > 5) {
        edges.push(`    B --> E`);
    }
    return `graph TD\n${nodes.join('\n')}\n${edges.join('\n')}`;
}
/**
 * Generates sample quiz options
 */
function generateQuizOptions(correctAnswer) {
    return [
        { id: 0, text: correctAnswer },
        { id: 1, text: 'Alternative answer 1' },
        { id: 2, text: 'Alternative answer 2' },
        { id: 3, text: 'Alternative answer 3' },
    ];
}
// ==============================================================================
// SEED DATA CREATION
// ==============================================================================
async function seedDocuments() {
    console.log('Seeding documents...');
    const documents = await Promise.all([
        // Document 1: Small PDF about Machine Learning
        prisma.document.create({
            data: {
                title: 'Introduction to Machine Learning',
                contentText: `Machine Learning is a subset of artificial intelligence that focuses on the development of algorithms and statistical models that enable computer systems to improve their performance on a specific task through experience.

The field encompasses several key paradigms:

1. Supervised Learning: Training models on labeled data where the correct output is known. Common algorithms include linear regression, decision trees, and neural networks.

2. Unsupervised Learning: Finding patterns in unlabeled data. Examples include clustering (K-means, hierarchical) and dimensionality reduction (PCA, t-SNE).

3. Reinforcement Learning: Learning through interaction with an environment, receiving rewards or penalties. Used in game playing, robotics, and autonomous systems.

Key concepts include:
- Feature Engineering: Selecting and transforming input variables
- Model Evaluation: Using metrics like accuracy, precision, recall, and F1 score
- Overfitting: When a model performs well on training data but poorly on new data
- Cross-Validation: Technique to assess model generalization

Applications of machine learning span across industries, from healthcare diagnostics to financial fraud detection, natural language processing, and computer vision.`,
                sourceType: SourceType.pdf,
                filePath: '/documents/ml-intro.pdf',
                fileSize: 245000,
                status: DocumentStatus.ready,
            },
        }),
        // Document 2: Text file about Climate Change
        prisma.document.create({
            data: {
                title: 'Climate Change Fundamentals',
                contentText: `Climate change refers to long-term shifts in global temperatures and weather patterns. While natural factors have historically influenced climate, scientific evidence overwhelmingly shows that human activities, particularly the burning of fossil fuels, have been the dominant cause of warming since the mid-20th century.

Greenhouse Effect:
The greenhouse effect is a natural process where certain gases in Earth's atmosphere trap heat. Key greenhouse gases include carbon dioxide (CO2), methane (CH4), and nitrous oxide (N2O). Human activities have significantly increased concentrations of these gases, intensifying the greenhouse effect and leading to global warming.

Impacts:
- Rising sea levels due to melting ice caps and thermal expansion
- More frequent extreme weather events (hurricanes, droughts, floods)
- Ecosystem disruption and biodiversity loss
- Ocean acidification affecting marine life
- Agricultural challenges and food security concerns

Mitigation Strategies:
1. Transitioning to renewable energy sources (solar, wind, hydroelectric)
2. Improving energy efficiency in buildings and transportation
3. Carbon capture and storage technologies
4. Reforestation and conservation efforts
5. Sustainable agricultural practices

Adaptation Measures:
Communities worldwide are implementing adaptation strategies including improved infrastructure resilience, water resource management, and climate-resilient crop varieties. International cooperation through agreements like the Paris Climate Accord aims to limit global temperature rise to well below 2°C above pre-industrial levels.`,
                sourceType: SourceType.text,
                filePath: '/documents/climate-change.txt',
                fileSize: 189000,
                status: DocumentStatus.ready,
            },
        }),
        // Document 3: Markdown file about Database Design
        prisma.document.create({
            data: {
                title: 'Database Design Best Practices',
                contentText: `# Database Design Best Practices

## Normalization

Database normalization is the process of organizing data to minimize redundancy and improve data integrity.

### First Normal Form (1NF)
- Each table cell should contain a single value
- Each record needs to be unique
- No repeating groups

### Second Normal Form (2NF)
- Must be in 1NF
- All non-key attributes must depend on the entire primary key
- Eliminates partial dependencies

### Third Normal Form (3NF)
- Must be in 2NF
- No transitive dependencies
- Non-key attributes depend only on the primary key

## Indexing Strategies

Indexes improve query performance but come with trade-offs:

**When to Index:**
- Primary keys (automatically indexed)
- Foreign keys used in joins
- Columns frequently used in WHERE clauses
- Columns used in ORDER BY or GROUP BY

**Index Types:**
- B-Tree: Default, good for equality and range queries
- Hash: Fast for equality lookups
- GiST/GIN: For full-text search and JSONB queries

## Query Optimization

1. **Use EXPLAIN ANALYZE** to understand query execution plans
2. **Avoid SELECT \***, specify only needed columns
3. **Batch operations** instead of individual inserts/updates
4. **Connection pooling** to manage database connections efficiently
5. **Implement caching** for frequently accessed, rarely changed data

## Data Types

Choose appropriate data types for efficiency:
- Use INT instead of VARCHAR for numeric IDs
- TIMESTAMP for dates (not VARCHAR)
- JSONB for flexible, semi-structured data (PostgreSQL)
- TEXT for long strings (no performance difference from VARCHAR in PostgreSQL)

## Relationships

- **One-to-Many**: Most common, use foreign keys
- **Many-to-Many**: Requires junction/join table
- **One-to-One**: Rare, consider if separate table is necessary

## Security Considerations

- Never store passwords in plain text (use bcrypt/argon2)
- Implement row-level security for multi-tenant applications
- Use parameterized queries to prevent SQL injection
- Encrypt sensitive data at rest and in transit
- Regular backups with point-in-time recovery capability`,
                sourceType: SourceType.markdown,
                filePath: '/documents/database-design.md',
                fileSize: 156000,
                status: DocumentStatus.ready,
            },
        }),
        // Document 4: URL-sourced content (Wikipedia-style)
        prisma.document.create({
            data: {
                title: 'Quantum Computing Overview',
                contentText: `Quantum computing is a type of computation that harnesses the collective properties of quantum states, such as superposition, interference, and entanglement, to perform calculations. Quantum computers are believed to be able to solve certain computational problems, such as integer factorization, substantially faster than classical computers.

Fundamental Principles:

Qubits: Unlike classical bits that are either 0 or 1, quantum bits (qubits) can exist in a superposition of both states simultaneously. This property allows quantum computers to process vast amounts of information in parallel.

Quantum Entanglement: When qubits become entangled, the state of one qubit is dependent on the state of another, regardless of the distance between them. This phenomenon enables quantum computers to perform complex correlations impossible for classical systems.

Quantum Gates: Operations on qubits are performed using quantum gates, analogous to logic gates in classical computing. Common quantum gates include Hadamard, Pauli, and CNOT gates.

Current State:
As of 2024, quantum computers remain in the early stages of development. Companies like IBM, Google, and IonQ have built quantum processors with 50-400 qubits, but these systems are error-prone and require extremely cold temperatures to operate. Quantum error correction remains a significant challenge.

Potential Applications:
- Cryptography: Breaking current encryption methods, developing quantum-safe cryptography
- Drug Discovery: Simulating molecular interactions
- Optimization Problems: Supply chain logistics, financial modeling
- Machine Learning: Quantum machine learning algorithms
- Materials Science: Discovering new materials with specific properties

Challenges:
Decoherence (qubits losing their quantum state), error rates, scalability, and the need for near-absolute-zero temperatures are major obstacles. Practical, fault-tolerant quantum computers capable of solving real-world problems at scale may still be years or decades away.`,
                sourceType: SourceType.url,
                sourceUrl: 'https://example.com/quantum-computing',
                fileSize: 215000,
                status: DocumentStatus.ready,
            },
        }),
        // Document 5: Processing status example
        prisma.document.create({
            data: {
                title: 'Large Research Paper (Processing)',
                contentText: '',
                sourceType: SourceType.pdf,
                filePath: '/documents/large-paper.pdf',
                fileSize: 5200000,
                status: DocumentStatus.processing,
            },
        }),
        // Document 6: Failed processing example
        prisma.document.create({
            data: {
                title: 'Encrypted Document',
                contentText: '',
                sourceType: SourceType.pdf,
                filePath: '/documents/encrypted.pdf',
                fileSize: 320000,
                status: DocumentStatus.failed,
                errorMessage: 'Unable to extract text: PDF is password-protected',
            },
        }),
    ]);
    console.log(`Created ${documents.length} documents`);
    return documents;
}
async function seedGraphs(documents) {
    console.log('Seeding graphs...');
    const graphs = [];
    // Graph for Machine Learning document (7 nodes)
    const mlGraph = await prisma.graph.create({
        data: {
            documentId: documents[0].id,
            mermaidCode: generateMermaidCode(7),
            layoutConfig: {
                layout: 'dagre',
                direction: 'TB',
                nodeSpacing: 100,
                rankSpacing: 150,
            },
            generationModel: 'claude-sonnet-4',
            status: GraphStatus.ready,
            version: 1,
        },
    });
    graphs.push(mlGraph);
    // Graph for Climate Change document (9 nodes)
    const climateGraph = await prisma.graph.create({
        data: {
            documentId: documents[1].id,
            mermaidCode: generateMermaidCode(9),
            layoutConfig: {
                layout: 'dagre',
                direction: 'TB',
                nodeSpacing: 120,
                rankSpacing: 150,
            },
            generationModel: 'claude-sonnet-4',
            status: GraphStatus.ready,
            version: 1,
        },
    });
    graphs.push(climateGraph);
    // Graph for Database Design document (12 nodes)
    const dbGraph = await prisma.graph.create({
        data: {
            documentId: documents[2].id,
            mermaidCode: generateMermaidCode(12),
            layoutConfig: {
                layout: 'dagre',
                direction: 'LR',
                nodeSpacing: 100,
                rankSpacing: 200,
            },
            generationModel: 'claude-sonnet-4',
            status: GraphStatus.ready,
            version: 1,
        },
    });
    graphs.push(dbGraph);
    // Graph for Quantum Computing (generating status)
    const quantumGraph = await prisma.graph.create({
        data: {
            documentId: documents[3].id,
            mermaidCode: '',
            generationModel: 'claude-sonnet-4',
            status: GraphStatus.generating,
            version: 1,
        },
    });
    graphs.push(quantumGraph);
    console.log(`Created ${graphs.length} graphs`);
    return graphs;
}
async function seedNodes(graphs) {
    console.log('Seeding nodes...');
    const nodesData = [];
    // Nodes for Machine Learning graph (7 nodes)
    const mlNodes = [
        {
            graphId: graphs[0].id,
            nodeKey: 'A',
            title: 'Machine Learning',
            contentSnippet: 'Subset of AI focused on algorithms that improve through experience',
            documentRefs: [{ start: 0, end: 150, text: 'Machine Learning is a subset of artificial intelligence...' }],
            positionX: 200,
            positionY: 50,
            metadata: { color: '#4A90E2', importance: 'high' },
        },
        {
            graphId: graphs[0].id,
            nodeKey: 'B',
            title: 'Supervised Learning',
            contentSnippet: 'Training on labeled data with known outputs',
            documentRefs: [{ start: 250, end: 380, text: 'Supervised Learning: Training models on labeled data...' }],
            positionX: 100,
            positionY: 200,
            metadata: { color: '#50C878', importance: 'medium' },
        },
        {
            graphId: graphs[0].id,
            nodeKey: 'C',
            title: 'Unsupervised Learning',
            contentSnippet: 'Finding patterns in unlabeled data',
            documentRefs: [{ start: 450, end: 580, text: 'Unsupervised Learning: Finding patterns...' }],
            positionX: 300,
            positionY: 200,
            metadata: { color: '#50C878', importance: 'medium' },
        },
        {
            graphId: graphs[0].id,
            nodeKey: 'D',
            title: 'Reinforcement Learning',
            contentSnippet: 'Learning through rewards and penalties',
            documentRefs: [{ start: 620, end: 750, text: 'Reinforcement Learning: Learning through interaction...' }],
            positionX: 500,
            positionY: 200,
            metadata: { color: '#50C878', importance: 'medium' },
        },
        {
            graphId: graphs[0].id,
            nodeKey: 'E',
            title: 'Feature Engineering',
            contentSnippet: 'Selecting and transforming input variables',
            positionX: 150,
            positionY: 350,
            metadata: { color: '#FFB347', importance: 'low' },
        },
        {
            graphId: graphs[0].id,
            nodeKey: 'F',
            title: 'Model Evaluation',
            contentSnippet: 'Assessing model performance with metrics',
            positionX: 350,
            positionY: 350,
            metadata: { color: '#FFB347', importance: 'low' },
        },
        {
            graphId: graphs[0].id,
            nodeKey: 'G',
            title: 'Applications',
            contentSnippet: 'Healthcare, finance, NLP, computer vision',
            positionX: 350,
            positionY: 500,
            metadata: { color: '#9B59B6', importance: 'medium' },
        },
    ];
    nodesData.push(...mlNodes);
    // Nodes for Climate Change graph (9 nodes)
    const climateNodes = [
        {
            graphId: graphs[1].id,
            nodeKey: 'A',
            title: 'Climate Change',
            contentSnippet: 'Long-term shifts in global temperatures and weather patterns',
            positionX: 250,
            positionY: 50,
            metadata: { color: '#E74C3C', importance: 'high' },
        },
        {
            graphId: graphs[1].id,
            nodeKey: 'B',
            title: 'Greenhouse Effect',
            contentSnippet: 'Natural process where gases trap heat in atmosphere',
            positionX: 250,
            positionY: 200,
            metadata: { color: '#F39C12', importance: 'high' },
        },
        {
            graphId: graphs[1].id,
            nodeKey: 'C',
            title: 'Rising Sea Levels',
            contentSnippet: 'Ice melting and thermal expansion',
            positionX: 100,
            positionY: 350,
            metadata: { color: '#3498DB', importance: 'medium' },
        },
        {
            graphId: graphs[1].id,
            nodeKey: 'D',
            title: 'Extreme Weather',
            contentSnippet: 'Hurricanes, droughts, floods',
            positionX: 250,
            positionY: 350,
            metadata: { color: '#3498DB', importance: 'medium' },
        },
        {
            graphId: graphs[1].id,
            nodeKey: 'E',
            title: 'Biodiversity Loss',
            contentSnippet: 'Ecosystem disruption',
            positionX: 400,
            positionY: 350,
            metadata: { color: '#3498DB', importance: 'medium' },
        },
        {
            graphId: graphs[1].id,
            nodeKey: 'F',
            title: 'Renewable Energy',
            contentSnippet: 'Solar, wind, hydroelectric power',
            positionX: 100,
            positionY: 500,
            metadata: { color: '#27AE60', importance: 'high' },
        },
        {
            graphId: graphs[1].id,
            nodeKey: 'G',
            title: 'Energy Efficiency',
            contentSnippet: 'Buildings and transportation improvements',
            positionX: 250,
            positionY: 500,
            metadata: { color: '#27AE60', importance: 'medium' },
        },
        {
            graphId: graphs[1].id,
            nodeKey: 'H',
            title: 'Reforestation',
            contentSnippet: 'Conservation efforts',
            positionX: 400,
            positionY: 500,
            metadata: { color: '#27AE60', importance: 'medium' },
        },
        {
            graphId: graphs[1].id,
            nodeKey: 'I',
            title: 'Paris Climate Accord',
            contentSnippet: 'Limit warming to below 2°C',
            positionX: 250,
            positionY: 650,
            metadata: { color: '#9B59B6', importance: 'high' },
        },
    ];
    nodesData.push(...climateNodes);
    // Nodes for Database Design graph (12 nodes)
    const dbNodes = Array.from({ length: 12 }, (_, i) => ({
        graphId: graphs[2].id,
        nodeKey: String.fromCharCode(65 + i),
        title: `Database Concept ${i + 1}`,
        contentSnippet: `Key concept in database design related to topic ${i + 1}`,
        positionX: 100 + (i % 4) * 150,
        positionY: 100 + Math.floor(i / 4) * 200,
        metadata: { color: '#34495E', importance: i < 4 ? 'high' : 'medium' },
    }));
    nodesData.push(...dbNodes);
    const nodes = await prisma.node.createMany({
        data: nodesData,
    });
    console.log(`Created ${nodesData.length} nodes`);
    return nodesData;
}
async function seedEdges(graphs) {
    console.log('Seeding edges...');
    const edgesData = [];
    // Get nodes for each graph to create edges
    const mlNodes = await prisma.node.findMany({ where: { graphId: graphs[0].id } });
    const climateNodes = await prisma.node.findMany({ where: { graphId: graphs[1].id } });
    const dbNodes = await prisma.node.findMany({ where: { graphId: graphs[2].id } });
    // Edges for ML graph
    const mlEdges = [
        {
            graphId: graphs[0].id,
            fromNodeId: mlNodes[0].id, // ML -> Supervised
            toNodeId: mlNodes[1].id,
            relationship: 'includes',
            aiExplanation: 'Supervised learning is one of the main paradigms within machine learning',
            strength: 0.95,
            metadata: { style: 'solid', weight: 'high' },
        },
        {
            graphId: graphs[0].id,
            fromNodeId: mlNodes[0].id, // ML -> Unsupervised
            toNodeId: mlNodes[2].id,
            relationship: 'includes',
            aiExplanation: 'Unsupervised learning is another main paradigm within machine learning',
            strength: 0.95,
            metadata: { style: 'solid', weight: 'high' },
        },
        {
            graphId: graphs[0].id,
            fromNodeId: mlNodes[0].id, // ML -> Reinforcement
            toNodeId: mlNodes[3].id,
            relationship: 'includes',
            aiExplanation: 'Reinforcement learning is the third main paradigm within machine learning',
            strength: 0.95,
            metadata: { style: 'solid', weight: 'high' },
        },
        {
            graphId: graphs[0].id,
            fromNodeId: mlNodes[1].id, // Supervised -> Feature Engineering
            toNodeId: mlNodes[4].id,
            relationship: 'requires',
            aiExplanation: 'Feature engineering is crucial for supervised learning model performance',
            strength: 0.85,
            metadata: { style: 'dashed', weight: 'medium' },
        },
        {
            graphId: graphs[0].id,
            fromNodeId: mlNodes[1].id, // Supervised -> Model Evaluation
            toNodeId: mlNodes[5].id,
            relationship: 'requires',
            aiExplanation: 'Supervised learning models must be evaluated to assess their performance',
            strength: 0.90,
            metadata: { style: 'dashed', weight: 'medium' },
        },
        {
            graphId: graphs[0].id,
            fromNodeId: mlNodes[0].id, // ML -> Applications
            toNodeId: mlNodes[6].id,
            relationship: 'enables',
            aiExplanation: 'Machine learning techniques enable various practical applications',
            strength: 0.88,
            metadata: { style: 'solid', weight: 'medium' },
        },
    ];
    edgesData.push(...mlEdges);
    // Edges for Climate graph
    const climateEdges = [
        {
            graphId: graphs[1].id,
            fromNodeId: climateNodes[0].id, // Climate Change -> Greenhouse Effect
            toNodeId: climateNodes[1].id,
            relationship: 'caused_by',
            aiExplanation: 'Enhanced greenhouse effect is the primary driver of climate change',
            strength: 0.98,
            metadata: { style: 'solid', weight: 'critical' },
        },
        {
            graphId: graphs[1].id,
            fromNodeId: climateNodes[1].id, // Greenhouse -> Sea Levels
            toNodeId: climateNodes[2].id,
            relationship: 'causes',
            strength: 0.92,
            metadata: { style: 'solid', weight: 'high' },
        },
        {
            graphId: graphs[1].id,
            fromNodeId: climateNodes[1].id, // Greenhouse -> Extreme Weather
            toNodeId: climateNodes[3].id,
            relationship: 'causes',
            strength: 0.89,
            metadata: { style: 'solid', weight: 'high' },
        },
        {
            graphId: graphs[1].id,
            fromNodeId: climateNodes[1].id, // Greenhouse -> Biodiversity
            toNodeId: climateNodes[4].id,
            relationship: 'causes',
            strength: 0.87,
            metadata: { style: 'solid', weight: 'high' },
        },
        {
            graphId: graphs[1].id,
            fromNodeId: climateNodes[5].id, // Renewable -> Climate Change
            toNodeId: climateNodes[0].id,
            relationship: 'mitigates',
            aiExplanation: 'Renewable energy reduces greenhouse gas emissions and helps address climate change',
            strength: 0.85,
            metadata: { style: 'dashed', weight: 'solution' },
        },
        {
            graphId: graphs[1].id,
            fromNodeId: climateNodes[6].id, // Efficiency -> Climate Change
            toNodeId: climateNodes[0].id,
            relationship: 'mitigates',
            strength: 0.80,
            metadata: { style: 'dashed', weight: 'solution' },
        },
        {
            graphId: graphs[1].id,
            fromNodeId: climateNodes[7].id, // Reforestation -> Climate Change
            toNodeId: climateNodes[0].id,
            relationship: 'mitigates',
            strength: 0.75,
            metadata: { style: 'dashed', weight: 'solution' },
        },
        {
            graphId: graphs[1].id,
            fromNodeId: climateNodes[8].id, // Paris Accord -> solutions
            toNodeId: climateNodes[5].id,
            relationship: 'promotes',
            strength: 0.70,
            metadata: { style: 'dotted', weight: 'policy' },
        },
    ];
    edgesData.push(...climateEdges);
    // Edges for Database graph (sequential chain)
    for (let i = 0; i < dbNodes.length - 1; i++) {
        edgesData.push({
            graphId: graphs[2].id,
            fromNodeId: dbNodes[i].id,
            toNodeId: dbNodes[i + 1].id,
            relationship: 'leads_to',
            strength: 0.75,
            metadata: { style: 'solid' },
        });
    }
    const edges = await prisma.edge.createMany({
        data: edgesData,
    });
    console.log(`Created ${edgesData.length} edges`);
    return edgesData;
}
async function seedNotes(graphs) {
    console.log('Seeding notes...');
    // Get some nodes and edges for notes
    const mlNodes = await prisma.node.findMany({ where: { graphId: graphs[0].id }, take: 3 });
    const mlEdges = await prisma.edge.findMany({ where: { graphId: graphs[0].id }, take: 2 });
    const notesData = [
        {
            graphId: graphs[0].id,
            nodeId: mlNodes[0].id,
            content: 'This is a core concept in ML. Remember to review the supervised learning examples.',
        },
        {
            graphId: graphs[0].id,
            nodeId: mlNodes[1].id,
            content: 'Important for understanding classification algorithms. Check out decision trees and neural networks.',
        },
        {
            graphId: graphs[0].id,
            edgeId: mlEdges[0].id,
            content: 'The relationship between ML and its subfields is hierarchical. Each paradigm has unique use cases.',
        },
        {
            graphId: graphs[0].id,
            content: 'Overall note on ML graph: Focus on understanding the three main paradigms before diving into applications.',
        },
        {
            graphId: graphs[1].id,
            content: 'Climate change mitigation requires both technological and policy solutions. The Paris Accord is a key international framework.',
        },
    ];
    const notes = await prisma.note.createMany({
        data: notesData,
    });
    console.log(`Created ${notesData.length} notes`);
    return notesData;
}
async function seedQuizQuestions(graphs) {
    console.log('Seeding quiz questions...');
    const quizData = [
        // ML Quiz Questions
        {
            graphId: graphs[0].id,
            questionText: 'What is the main difference between supervised and unsupervised learning?',
            options: generateQuizOptions('Supervised learning uses labeled data, while unsupervised learning finds patterns in unlabeled data'),
            correctAnswer: 0,
            explanation: 'Supervised learning requires labeled training data where the correct output is known, whereas unsupervised learning works with unlabeled data to discover hidden patterns or structures.',
            difficulty: QuizDifficulty.easy,
            nodeRefs: [
                { nodeKey: 'B', title: 'Supervised Learning' },
                { nodeKey: 'C', title: 'Unsupervised Learning' },
            ],
        },
        {
            graphId: graphs[0].id,
            questionText: 'Which machine learning paradigm is used for training agents through rewards and penalties?',
            options: generateQuizOptions('Reinforcement Learning'),
            correctAnswer: 0,
            explanation: 'Reinforcement learning involves training an agent to make decisions by receiving rewards for good actions and penalties for bad ones, learning optimal behavior through interaction with an environment.',
            difficulty: QuizDifficulty.easy,
            nodeRefs: [{ nodeKey: 'D', title: 'Reinforcement Learning' }],
        },
        {
            graphId: graphs[0].id,
            questionText: 'Why is feature engineering important in machine learning?',
            options: generateQuizOptions('It helps select and transform input variables to improve model performance'),
            correctAnswer: 0,
            explanation: 'Feature engineering is critical because the quality and relevance of input features directly impact model performance. Well-engineered features can significantly improve accuracy and reduce training time.',
            difficulty: QuizDifficulty.medium,
            nodeRefs: [{ nodeKey: 'E', title: 'Feature Engineering' }],
        },
        {
            graphId: graphs[0].id,
            questionText: 'What does overfitting mean in the context of machine learning?',
            options: generateQuizOptions('The model performs well on training data but poorly on new data'),
            correctAnswer: 0,
            explanation: 'Overfitting occurs when a model learns the training data too well, including its noise and outliers, resulting in poor generalization to new, unseen data. Techniques like cross-validation and regularization help prevent overfitting.',
            difficulty: QuizDifficulty.medium,
            nodeRefs: [{ nodeKey: 'F', title: 'Model Evaluation' }],
        },
        {
            graphId: graphs[0].id,
            questionText: 'Which application domain would benefit most from computer vision techniques in machine learning?',
            options: generateQuizOptions('Autonomous vehicles for object detection and scene understanding'),
            correctAnswer: 0,
            explanation: 'Computer vision, a subset of machine learning, is crucial for autonomous vehicles as they need to detect and recognize objects, understand scenes, and make real-time decisions based on visual input.',
            difficulty: QuizDifficulty.hard,
            nodeRefs: [{ nodeKey: 'G', title: 'Applications' }],
        },
        // Climate Change Quiz Questions
        {
            graphId: graphs[1].id,
            questionText: 'What is the primary cause of recent climate change?',
            options: generateQuizOptions('Human activities, particularly burning fossil fuels'),
            correctAnswer: 0,
            explanation: 'Scientific evidence overwhelmingly shows that human activities, especially the burning of fossil fuels for energy, have been the dominant cause of climate change since the mid-20th century, leading to increased greenhouse gas concentrations.',
            difficulty: QuizDifficulty.easy,
            nodeRefs: [{ nodeKey: 'A', title: 'Climate Change' }],
        },
        {
            graphId: graphs[1].id,
            questionText: 'How does the greenhouse effect contribute to global warming?',
            options: generateQuizOptions('Greenhouse gases trap heat in the atmosphere, preventing it from escaping to space'),
            correctAnswer: 0,
            explanation: 'The greenhouse effect is a natural process where gases like CO2, methane, and nitrous oxide absorb and re-emit infrared radiation, trapping heat in the atmosphere. Human activities have intensified this effect.',
            difficulty: QuizDifficulty.medium,
            nodeRefs: [{ nodeKey: 'B', title: 'Greenhouse Effect' }],
        },
        {
            graphId: graphs[1].id,
            questionText: 'Which of the following is NOT a mitigation strategy for climate change mentioned in the document?',
            options: [
                { id: 0, text: 'Geoengineering to reflect sunlight away from Earth' },
                { id: 1, text: 'Transitioning to renewable energy sources' },
                { id: 2, text: 'Carbon capture and storage technologies' },
                { id: 3, text: 'Reforestation and conservation efforts' },
            ],
            correctAnswer: 0,
            explanation: 'While geoengineering is discussed as a potential solution by some scientists, it was not mentioned in the document. The document focused on renewable energy, carbon capture, reforestation, energy efficiency, and sustainable agriculture.',
            difficulty: QuizDifficulty.hard,
            nodeRefs: [
                { nodeKey: 'F', title: 'Renewable Energy' },
                { nodeKey: 'G', title: 'Energy Efficiency' },
                { nodeKey: 'H', title: 'Reforestation' },
            ],
        },
        {
            graphId: graphs[1].id,
            questionText: 'What is the goal of the Paris Climate Accord?',
            options: generateQuizOptions('Limit global temperature rise to well below 2°C above pre-industrial levels'),
            correctAnswer: 0,
            explanation: 'The Paris Climate Accord is an international agreement aiming to limit global warming to well below 2°C, preferably to 1.5°C, compared to pre-industrial levels through coordinated climate action.',
            difficulty: QuizDifficulty.medium,
            nodeRefs: [{ nodeKey: 'I', title: 'Paris Climate Accord' }],
        },
        // Database Design Quiz Questions
        {
            graphId: graphs[2].id,
            questionText: 'What is the primary goal of database normalization?',
            options: generateQuizOptions('Minimize redundancy and improve data integrity'),
            correctAnswer: 0,
            explanation: 'Database normalization is the process of organizing data to reduce redundancy, eliminate data anomalies, and ensure data integrity by following a set of normal forms.',
            difficulty: QuizDifficulty.easy,
            nodeRefs: [{ nodeKey: 'A', title: 'Database Concept 1' }],
        },
        {
            graphId: graphs[2].id,
            questionText: 'When should you create an index on a database column?',
            options: generateQuizOptions('When the column is frequently used in WHERE clauses or JOIN operations'),
            correctAnswer: 0,
            explanation: 'Indexes improve query performance for columns that are frequently searched, filtered, or joined. However, they come with storage overhead and can slow down write operations, so they should be used strategically.',
            difficulty: QuizDifficulty.medium,
            nodeRefs: [{ nodeKey: 'C', title: 'Database Concept 3' }],
        },
    ];
    const quizzes = await prisma.quizQuestion.createMany({
        data: quizData,
    });
    console.log(`Created ${quizData.length} quiz questions`);
    return quizData;
}
// ==============================================================================
// MAIN SEED FUNCTION
// ==============================================================================
async function main() {
    console.log('Starting database seed...\n');
    try {
        // Clean existing data (in reverse order of dependencies)
        console.log('Cleaning existing data...');
        await prisma.quizQuestion.deleteMany();
        await prisma.note.deleteMany();
        await prisma.edge.deleteMany();
        await prisma.node.deleteMany();
        await prisma.graph.deleteMany();
        await prisma.document.deleteMany();
        console.log('Existing data cleaned\n');
        // Seed in order of dependencies
        const documents = await seedDocuments();
        console.log('');
        const graphs = await seedGraphs(documents);
        console.log('');
        const nodes = await seedNodes(graphs);
        console.log('');
        const edges = await seedEdges(graphs);
        console.log('');
        const notes = await seedNotes(graphs);
        console.log('');
        const quizzes = await seedQuizQuestions(graphs);
        console.log('');
        console.log('Database seeding completed successfully! 🎉');
        console.log('\nSummary:');
        console.log(`- ${documents.length} documents`);
        console.log(`- ${graphs.length} graphs`);
        console.log(`- ${nodes.length} nodes`);
        console.log(`- ${edges.length} edges`);
        console.log(`- ${notes.length} notes`);
        console.log(`- ${quizzes.length} quiz questions`);
    }
    catch (error) {
        console.error('Error during seeding:', error);
        throw error;
    }
}
// ==============================================================================
// EXECUTION
// ==============================================================================
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map