/**
 * SkillRegistry Tests
 */

import SkillRegistry, { Skill, SkillTemplate } from './SkillRegistry';

describe('Skill', () => {
  test('creates skill with default configuration', () => {
    const skill = new Skill('test-skill', {
      name: 'Test Skill',
      description: 'A test skill'
    });

    expect(skill.id).toBe('test-skill');
    expect(skill.name).toBe('Test Skill');
    expect(skill.successRate).toBe(1.0);
  });

  test('validates required parameters', () => {
    const skill = new Skill('test-skill', {
      parameters: [
        { name: 'input', type: 'string', required: true },
        { name: 'optional', type: 'number', required: false }
      ]
    });

    const validation = skill.validateParams({});
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Missing required parameter: input');

    const validValidation = skill.validateParams({ input: 'test' });
    expect(validValidation.valid).toBe(true);
  });

  test('executes handler and updates metrics', async () => {
    const skill = new Skill('test-skill', {
      handler: async (context) => ({ result: context.input })
    });

    const result = await skill.execute({}, { input: 'test value' });
    expect(result.success).toBe(true);
    expect(result.result.result).toBe('test value');
    expect(skill.totalExecutions).toBe(1);
  });
});

describe('SkillTemplate', () => {
  test('creates template with steps', () => {
    const template = new SkillTemplate('test-template', {
      name: 'Test Template',
      steps: [
        { id: 'step1', skillId: 'skill1' },
        { id: 'step2', skillId: 'skill2' }
      ]
    });

    expect(template.steps.length).toBe(2);
  });

  test('converts template to skill', () => {
    const template = new SkillTemplate('test-template', {
      name: 'Test Template',
      steps: [
        { id: 'step1', action: async () => ({ value: 'executed' }) }
      ]
    });

    const skill = template.toSkill();
    expect(skill).toBeInstanceOf(Skill);
    expect(skill.tags).toContain('template');
  });
});

describe('SkillRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new SkillRegistry({ verbose: false });
  });

  test('registers and retrieves skills', () => {
    const skill = new Skill('test-skill', { name: 'Test' });
    registry.register(skill);

    const retrieved = registry.getSkill('test-skill');
    expect(retrieved).toBe(skill);
  });

  test('registers and retrieves templates', () => {
    const template = new SkillTemplate('test-template', { name: 'Test' });
    registry.registerTemplate(template);

    const retrieved = registry.templates.get('test-template');
    expect(retrieved).toBe(template);
  });

  test('creates skill from template', () => {
    registry.registerTemplate(new SkillTemplate('test-template', {
      name: 'From Template',
      steps: []
    }));

    const skill = registry.createFromTemplate('test-template', { id: 'generated-skill' });
    expect(skill).toBeInstanceOf(Skill);
    expect(skill.id).toBe('generated-skill');
  });

  test('finds skills by category', () => {
    registry.register(new Skill('skill1', { category: 'code' }));
    registry.register(new Skill('skill2', { category: 'code' }));
    registry.register(new Skill('skill3', { category: 'research' }));

    const codeSkills = registry.findSkills({ category: 'code' });
    expect(codeSkills.length).toBe(2);
  });

  test('finds skills by tags', () => {
    registry.register(new Skill('skill1', { tags: ['code', 'generation'] }));
    registry.register(new Skill('skill2', { tags: ['code', 'analysis'] }));

    const found = registry.findSkills({ tags: ['generation'] });
    expect(found.length).toBe(1);
  });

  test('searches skills by name/description', () => {
    registry.register(new Skill('skill1', { name: 'Code Generator', description: 'Generates code' }));

    const found = registry.findSkills({ search: 'generator' });
    expect(found.length).toBe(1);
  });

  test('creates aliases for skills', () => {
    registry.register(new Skill('test-skill', { name: 'Test' }));
    registry.alias('alias', 'test-skill');

    const skill = registry.getSkillByAlias('alias');
    expect(skill.id).toBe('test-skill');
  });

  test('removes skills', () => {
    registry.register(new Skill('test-skill', { name: 'Test' }));
    expect(registry.remove('test-skill')).toBe(true);
    expect(registry.getSkill('test-skill')).toBeNull();
  });

  test('exports registry data', () => {
    registry.register(new Skill('test-skill', { name: 'Test' }));

    const exportData = registry.export();
    expect(exportData.skills.length).toBe(1);
    expect(exportData.skills[0].id).toBe('test-skill');
  });

  test('provides statistics', () => {
    registry.register(new Skill('skill1', { category: 'code' }));
    registry.register(new Skill('skill2', { category: 'code' }));

    const stats = registry.getStats();
    expect(stats.totalSkills).toBe(2);
    expect(stats.categoryCounts.code).toBe(2);
  });
});