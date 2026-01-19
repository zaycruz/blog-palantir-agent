// Skills loader - loads markdown skill files for agents

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SKILLS_ROOT = resolve(process.cwd(), 'skills');

export interface Skill {
  name: string;
  content: string;
  path: string;
}

/**
 * Load all skills for a specific agent
 * Skills are markdown files in skills/{agentName}/
 */
export function loadSkills(agentName: string): Skill[] {
  const skillsDir = join(SKILLS_ROOT, agentName);
  
  if (!existsSync(skillsDir)) {
    return [];
  }

  try {
    const files = readdirSync(skillsDir).filter(f => f.endsWith('.md'));
    
    return files.map(file => {
      const filePath = join(skillsDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const name = file.replace('.md', '').replace(/-/g, ' ');
      
      return {
        name,
        content,
        path: filePath
      };
    });
  } catch (error) {
    console.warn(`[Skills] Failed to load skills for ${agentName}:`, error);
    return [];
  }
}

/**
 * Format skills for injection into system prompt
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return '';
  }

  const formatted = skills.map(skill => {
    return `### ${skill.name}\n\n${skill.content}`;
  }).join('\n\n---\n\n');

  return `\n\n## Loaded Skills\n\n${formatted}`;
}

/**
 * Load and format skills for an agent in one call
 */
export function getSkillsPrompt(agentName: string): string {
  const skills = loadSkills(agentName);
  return formatSkillsForPrompt(skills);
}

/**
 * List available skill files for an agent
 */
export function listSkillFiles(agentName: string): string[] {
  const skillsDir = join(SKILLS_ROOT, agentName);
  
  if (!existsSync(skillsDir)) {
    return [];
  }

  try {
    return readdirSync(skillsDir).filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
}
