'use client';

import React from 'react';

export default function Filters({
  domains = [],
  topics = [],
  selectedDomain,
  selectedTopic,
  onDomainChange,
  onTopicChange,
}) {
  const MATH_CODES = new Set(['H', 'P', 'Q', 'S']);
  const RW_CODES = new Set(['CAS', 'INI', 'EOI', 'SEC']);

  const mathDomains = domains.filter(d => MATH_CODES.has(d.domain_code));
  const rwDomains = domains.filter(d => RW_CODES.has(d.domain_code));
  const otherDomains = domains.filter(
    d => !MATH_CODES.has(d.domain_code) && !RW_CODES.has(d.domain_code)
  );

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end">
      {/* Domain Dropdown */}
      <div className="flex flex-col">
        <label className="text-sm font-medium mb-1">Domain</label>
        <select
          value={selectedDomain || ''}
          onChange={(e) => onDomainChange(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">All Domains</option>

          {mathDomains.length > 0 && (
            <optgroup label="Math">
              {mathDomains.map(d => (
                <option key={d.domain_code} value={d.domain_name}>
                  {d.domain_name}
                </option>
              ))}
            </optgroup>
          )}

          {rwDomains.length > 0 && (
            <optgroup label="Reading and Writing">
              {rwDomains.map(d => (
                <option key={d.domain_code} value={d.domain_name}>
                  {d.domain_name}
                </option>
              ))}
            </optgroup>
          )}

          {otherDomains.length > 0 && (
            <optgroup label="Other">
              {otherDomains.map(d => (
                <option key={d.domain_code || d.domain_name} value={d.domain_name}>
                  {d.domain_name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Topic Dropdown */}
      <div className="flex flex-col">
        <label className="text-sm font-medium mb-1">Topic</label>
        <select
          value={selectedTopic || ''}
          onChange={(e) => onTopicChange(e.target.value)}
          className="border rounded px-3 py-2"
          disabled={!selectedDomain}
        >
          <option value="">All Topics</option>
          {topics.map(t => (
            <option key={t.skill_code || t.skill_name} value={t.skill_name}>
              {t.skill_name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
