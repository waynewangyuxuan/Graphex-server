/**
 * Prompt Templates Tests - Enhanced Node Requirements
 *
 * Tests for AI prompt templates to ensure they properly instruct the AI
 * to generate nodeType and summary fields for each node.
 *
 * Coverage:
 * 1. Graph generation prompt includes nodeType taxonomy
 * 2. Graph generation prompt requires 2-sentence summary
 * 3. Output format specification includes both fields
 * 4. Template validation and constraints
 */

import { getTemplate, getTemplateVersions, getAllTemplates } from '../prompt-templates';
import { PromptType } from '../../../types/prompt.types';

describe('Prompt Templates - Enhanced Node Structure', () => {
  describe('Template Retrieval', () => {
    it('should retrieve production graph-generation template', () => {
      const template = getTemplate('graph-generation', 'production');

      expect(template).toBeDefined();
      expect(template.type).toBe('graph-generation');
      expect(template.version).toBe('production');
      expect(template.template).toBeDefined();
    });

    it('should retrieve all versions of a prompt type', () => {
      const versions = getTemplateVersions('graph-generation');

      expect(versions.length).toBeGreaterThan(0);
      expect(versions.some(v => v.version === 'production')).toBe(true);
    });

    it('should retrieve all templates', () => {
      const allTemplates = getAllTemplates();

      expect(allTemplates.length).toBeGreaterThan(0);
      expect(allTemplates.some(t => t.type === 'graph-generation')).toBe(true);
    });

    it('should throw error for non-existent template', () => {
      expect(() => {
        getTemplate('non-existent' as PromptType, 'production');
      }).toThrow('No template found');
    });
  });

  describe('Graph Generation Template - NodeType Requirements', () => {
    let template: string;

    beforeEach(() => {
      const promptTemplate = getTemplate('graph-generation', 'production');
      template = promptTemplate.template;
    });

    it('should include nodeType classification section', () => {
      expect(template).toContain('Node Classification');
      expect(template).toContain('nodeType');
    });

    it('should include Core Knowledge category with correct types', () => {
      expect(template).toContain('Core Knowledge');
      expect(template).toContain('concept');
      expect(template).toContain('definition');
      expect(template).toContain('theory');
    });

    it('should include Evidence & Support category with correct types', () => {
      expect(template).toContain('Evidence & Support');
      expect(template).toContain('fact');
      expect(template).toContain('evidence');
      expect(template).toContain('example');
      expect(template).toContain('statistic');
    });

    it('should include Argumentation category with correct types', () => {
      expect(template).toContain('Argumentation');
      expect(template).toContain('argument');
      expect(template).toContain('premise');
      expect(template).toContain('conclusion');
      expect(template).toContain('counterargument');
    });

    it('should include Actors & Entities category with correct types', () => {
      expect(template).toContain('Actors & Entities');
      expect(template).toContain('person');
      expect(template).toContain('organization');
      expect(template).toContain('place');
      expect(template).toContain('event');
    });

    it('should include Process & Method category with correct types', () => {
      expect(template).toContain('Process & Method');
      expect(template).toContain('method');
      expect(template).toContain('process');
      expect(template).toContain('mechanism');
      expect(template).toContain('algorithm');
    });

    it('should include Comparison & Analysis category with correct types', () => {
      expect(template).toContain('Comparison & Analysis');
      expect(template).toContain('comparison');
      expect(template).toContain('classification');
      expect(template).toContain('analysis');
    });

    it('should include Problem Solving category with correct types', () => {
      expect(template).toContain('Problem Solving');
      expect(template).toContain('question');
      expect(template).toContain('problem');
      expect(template).toContain('solution');
    });

    it('should require MOST SPECIFIC type selection', () => {
      expect(template).toContain('MOST SPECIFIC');
      expect(template.toLowerCase()).toContain('choose');
    });

    it('should instruct to use ONE category per node', () => {
      expect(template.toUpperCase()).toContain('ONE');
    });
  });

  describe('Graph Generation Template - Summary Requirements', () => {
    let template: string;

    beforeEach(() => {
      const promptTemplate = getTemplate('graph-generation', 'production');
      template = promptTemplate.template;
    });

    it('should include summary section', () => {
      expect(template).toContain('Node Summary');
      expect(template).toContain('summary');
    });

    it('should require 2-sentence summary', () => {
      expect(template).toContain('2-sentence');
    });

    it('should specify summary requirements', () => {
      const summarySection = template.substring(
        template.indexOf('Node Summary'),
        template.indexOf('Relationships')
      );

      expect(summarySection).toContain('what this concept');
      expect(summarySection).toContain('context');
      expect(summarySection).toContain('self-contained');
    });

    it('should require clear, accessible language', () => {
      expect(template).toContain('clear');
      expect(template).toContain('accessible');
    });

    it('should mark summary as REQUIRED', () => {
      const summarySection = template.substring(
        template.indexOf('Node Summary'),
        template.indexOf('Relationships')
      );

      expect(summarySection.toUpperCase()).toContain('REQUIRED');
    });
  });

  describe('Graph Generation Template - Output Format', () => {
    let template: string;

    beforeEach(() => {
      const promptTemplate = getTemplate('graph-generation', 'production');
      template = promptTemplate.template;
    });

    it('should include nodeType in output format specification', () => {
      const outputSection = template.substring(
        template.indexOf('Output Format'),
        template.indexOf('Constraints')
      );

      expect(outputSection).toContain('"nodeType"');
    });

    it('should include summary in output format specification', () => {
      const outputSection = template.substring(
        template.indexOf('Output Format'),
        template.indexOf('Constraints')
      );

      expect(outputSection).toContain('"summary"');
    });

    it('should show example nodeType value in output format', () => {
      const outputSection = template.substring(
        template.indexOf('Output Format'),
        template.indexOf('Constraints')
      );

      expect(outputSection).toContain('"nodeType": "concept"');
    });

    it('should show example summary in output format', () => {
      const outputSection = template.substring(
        template.indexOf('Output Format'),
        template.indexOf('Constraints')
      );

      expect(outputSection).toContain('2-sentence summary');
    });

    it('should show complete node structure with all fields', () => {
      const outputSection = template.substring(
        template.indexOf('Output Format'),
        template.indexOf('Constraints')
      );

      expect(outputSection).toContain('"id"');
      expect(outputSection).toContain('"title"');
      expect(outputSection).toContain('"nodeType"');
      expect(outputSection).toContain('"summary"');
      expect(outputSection).toContain('"description"');
      expect(outputSection).toContain('"metadata"');
    });
  });

  describe('Graph Generation Template - Constraints', () => {
    let template: string;

    beforeEach(() => {
      const promptTemplate = getTemplate('graph-generation', 'production');
      template = promptTemplate.template;
    });

    it('should require valid nodeType from taxonomy', () => {
      const constraintsSection = template.substring(
        template.indexOf('Constraints')
      );

      expect(constraintsSection).toContain('valid nodeType');
      expect(constraintsSection).toContain('taxonomy');
    });

    it('should require 2-sentence summary constraint', () => {
      const constraintsSection = template.substring(
        template.indexOf('Constraints')
      );

      expect(constraintsSection).toContain('2-sentence summary');
    });

    it('should mark nodeType as MUST have', () => {
      const constraintsSection = template.substring(
        template.indexOf('Constraints')
      );

      expect(constraintsSection.toUpperCase()).toContain('MUST');
      expect(constraintsSection).toContain('nodeType');
    });

    it('should mark summary as MUST have', () => {
      const constraintsSection = template.substring(
        template.indexOf('Constraints')
      );

      expect(constraintsSection.toUpperCase()).toContain('MUST');
      expect(constraintsSection).toContain('summary');
    });
  });

  describe('Template Metadata', () => {
    it('should have required context fields', () => {
      const template = getTemplate('graph-generation', 'production');

      expect(template.metadata).toBeDefined();
      expect(template.metadata.requiredContext).toContain('documentText');
      expect(template.metadata.requiredContext).toContain('documentTitle');
    });

    it('should have node count constraints', () => {
      const template = getTemplate('graph-generation', 'production');

      expect(template.metadata.constraints).toBeDefined();
      expect(template.metadata.constraints?.nodeCount).toBeDefined();
      expect(template.metadata.constraints?.nodeCount?.min).toBe(7);
      expect(template.metadata.constraints?.nodeCount?.max).toBe(15);
    });

    it('should have max tokens constraint', () => {
      const template = getTemplate('graph-generation', 'production');

      expect(template.metadata.constraints?.maxTokens).toBeDefined();
      expect(template.metadata.constraints?.maxTokens).toBeGreaterThan(0);
    });

    it('should have creation date', () => {
      const template = getTemplate('graph-generation', 'production');

      expect(template.metadata.created).toBeDefined();
      expect(template.metadata.created).toBeInstanceOf(Date);
    });

    it('should have description', () => {
      const template = getTemplate('graph-generation', 'production');

      expect(template.metadata.description).toBeDefined();
      expect(template.metadata.description.length).toBeGreaterThan(0);
    });
  });

  describe('Experimental Template Comparison', () => {
    it('should have experimental version available', () => {
      const experimentalTemplate = getTemplate('graph-generation', 'experimental');

      expect(experimentalTemplate).toBeDefined();
      expect(experimentalTemplate.version).toBe('experimental');
    });

    it('should have different content between production and experimental', () => {
      const production = getTemplate('graph-generation', 'production');
      const experimental = getTemplate('graph-generation', 'experimental');

      expect(production.template).not.toBe(experimental.template);
    });
  });

  describe('Anti-Hallucination Rules', () => {
    let template: string;

    beforeEach(() => {
      const promptTemplate = getTemplate('graph-generation', 'production');
      template = promptTemplate.template;
    });

    it('should include anti-hallucination section', () => {
      expect(template).toContain('Anti-Hallucination');
    });

    it('should warn against inventing concepts', () => {
      expect(template.toUpperCase()).toContain('DO NOT INVENT');
    });

    it('should require source grounding', () => {
      expect(template).toContain('Source Grounding');
      expect(template.toUpperCase()).toContain('CRITICAL');
    });

    it('should require explicit mention in document', () => {
      expect(template).toContain('explicitly');
      expect(template).toContain('document');
    });
  });

  describe('Relationship Taxonomy', () => {
    let template: string;

    beforeEach(() => {
      const promptTemplate = getTemplate('graph-generation', 'production');
      template = promptTemplate.template;
    });

    it('should include relationship taxonomy', () => {
      expect(template).toContain('relationship');
      expect(template).toContain('Hierarchical');
      expect(template).toContain('Functional');
    });

    it('should discourage vague relationships', () => {
      expect(template).toContain('AVOID vague');
      expect(template).toContain('relates to');
    });

    it('should include specific relationship types', () => {
      expect(template).toContain('is-a');
      expect(template).toContain('part-of');
      expect(template).toContain('enables');
      expect(template).toContain('requires');
    });
  });

  describe('Template Consistency Across Types', () => {
    it('should have consistent system prompts', () => {
      const graphTemplate = getTemplate('graph-generation', 'production');
      const connectionTemplate = getTemplate('connection-explanation', 'production');

      expect(graphTemplate.systemPrompt).toBeDefined();
      expect(connectionTemplate.systemPrompt).toBeDefined();
      expect(typeof graphTemplate.systemPrompt).toBe('string');
      expect(typeof connectionTemplate.systemPrompt).toBe('string');
    });

    it('should have all required fields', () => {
      const allTemplates = getAllTemplates();

      for (const template of allTemplates) {
        expect(template.id).toBeDefined();
        expect(template.type).toBeDefined();
        expect(template.version).toBeDefined();
        expect(template.systemPrompt).toBeDefined();
        expect(template.template).toBeDefined();
        expect(template.metadata).toBeDefined();
      }
    });

    it('should have unique template IDs', () => {
      const allTemplates = getAllTemplates();
      const ids = allTemplates.map(t => t.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});

describe('Template Integration Tests', () => {
  describe('Context Variable Replacement', () => {
    it('should have placeholders for required context', () => {
      const template = getTemplate('graph-generation', 'production');

      expect(template.template).toContain('{{documentTitle}}');
      expect(template.template).toContain('{{documentText}}');
    });

    it('should have conditional sections for optional context', () => {
      const connectionTemplate = getTemplate('connection-explanation', 'production');

      expect(connectionTemplate.template).toContain('{{#if userHypothesis}}');
    });
  });

  describe('JSON Output Format Validation', () => {
    it('should specify valid JSON structure', () => {
      const template = getTemplate('graph-generation', 'production');
      const outputSection = template.template.substring(
        template.template.indexOf('Output Format')
      );

      expect(outputSection).toContain('{');
      expect(outputSection).toContain('}');
      expect(outputSection).toContain('"mermaidCode"');
      expect(outputSection).toContain('"nodes"');
      expect(outputSection).toContain('"edges"');
    });

    it('should show array structure for nodes', () => {
      const template = getTemplate('graph-generation', 'production');
      const outputSection = template.template.substring(
        template.template.indexOf('Output Format')
      );

      expect(outputSection).toContain('"nodes": [');
    });

    it('should show array structure for edges', () => {
      const template = getTemplate('graph-generation', 'production');
      const outputSection = template.template.substring(
        template.template.indexOf('Output Format')
      );

      expect(outputSection).toContain('"edges": [');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle short documents', () => {
      const template = getTemplate('graph-generation', 'production');

      expect(template.template).toContain('too short');
      expect(template.template).toContain('minimal graph');
    });

    it('should handle documents lacking coherent concepts', () => {
      const template = getTemplate('graph-generation', 'production');

      expect(template.template).toContain('lacks coherent concepts');
      expect(template.template).toContain('explanation');
    });

    it('should prefer quality over quantity', () => {
      const template = getTemplate('graph-generation', 'production');

      expect(template.template).toContain('fewer high-quality');
    });
  });
});
