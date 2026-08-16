import {describe, expect, it} from '@jest/globals';
import {JsonGedcomData} from 'topola';
import {
  ancestorCone,
  buildAncestorNetwork,
  descentCone,
  lineThrough,
} from './graph';

/**
 * A cousin marriage, which is what pedigree collapse looks like at its
 * smallest: the root's parents are first cousins, so one couple two
 * generations up is reached by two different lines.
 *
 *            G ⚭ H
 *          /        \
 *      C ⚭ D       E ⚭ F
 *        |            |
 *        A     ⚭      B
 *              |
 *              R
 */
function cousinMarriage(): JsonGedcomData {
  return {
    indis: [
      {id: 'R', famc: 'fAB'},
      {id: 'A', famc: 'fCD', fams: ['fAB']},
      {id: 'B', famc: 'fEF', fams: ['fAB']},
      {id: 'C', famc: 'fGH', fams: ['fCD']},
      {id: 'D', fams: ['fCD']},
      {id: 'E', famc: 'fGH', fams: ['fEF']},
      {id: 'F', fams: ['fEF']},
      {id: 'G', fams: ['fGH']},
      {id: 'H', fams: ['fGH']},
      {id: 'X'},
    ],
    fams: [
      {id: 'fAB', husb: 'A', wife: 'B', children: ['R']},
      {id: 'fCD', husb: 'C', wife: 'D', children: ['A']},
      {id: 'fEF', husb: 'E', wife: 'F', children: ['B']},
      {id: 'fGH', husb: 'G', wife: 'H', children: ['C', 'E']},
    ],
  };
}

describe('the ancestor network', () => {
  it('holds every ancestor once and nobody else', () => {
    const network = buildAncestorNetwork(cousinMarriage(), 'R');
    expect(Array.from(network.persons.keys()).sort()).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'R',
    ]);
    expect(network.unions.size).toBe(4);
  });

  it('counts the lines of descent a pedigree chart would draw separately', () => {
    const network = buildAncestorNetwork(cousinMarriage(), 'R');
    expect(network.persons.get('G')?.paths).toBe(2);
    expect(network.persons.get('H')?.paths).toBe(2);
    expect(network.persons.get('C')?.paths).toBe(1);
    expect(network.repeated.map((person) => person.id)).toEqual(['G', 'H']);
    // Nine people, but a tree layout needs eleven boxes for them.
    expect(network.pedigreeBoxes).toBe(11);
  });

  it('ranks by the longest route, so nobody sits below their own descendant', () => {
    const data = cousinMarriage();
    // H is also R's great-great-grandmother down a fourth line: give D a
    // mother who is H's daughter. That puts H four generations up one way and
    // two the other; the box has to go on the fourth row.
    data.indis.push({id: 'K', famc: 'fGH', fams: ['fKL']});
    data.indis.push({id: 'L', fams: ['fKL']});
    data.indis.push({id: 'M', famc: 'fKL', fams: ['fCD']});
    data.fams.push({id: 'fKL', husb: 'L', wife: 'K', children: ['M']});
    const cd = data.fams.find((fam) => fam.id === 'fCD');
    if (cd) cd.wife = 'M';
    const withoutD = data.indis.filter((indi) => indi.id !== 'D');
    const network = buildAncestorNetwork(
      {indis: withoutD, fams: data.fams},
      'R',
    );
    expect(network.persons.get('M')?.rank).toBe(2);
    expect(network.persons.get('K')?.rank).toBe(3);
    expect(network.persons.get('G')?.rank).toBe(4);
    expect(network.persons.get('H')?.rank).toBe(4);
    expect(network.persons.get('G')?.paths).toBe(3);
  });

  it('survives a file that makes somebody their own ancestor', () => {
    const data = cousinMarriage();
    // G's parents are C and D, who descend from G.
    data.indis = data.indis.map((indi) =>
      indi.id === 'G' ? {...indi, famc: 'fCD'} : indi,
    );
    const network = buildAncestorNetwork(data, 'R');
    expect(network.persons.has('G')).toBe(true);
    expect(network.persons.get('G')?.rank).toBeGreaterThan(0);
  });

  it('lights up only the lines that put a person on the chart', () => {
    const network = buildAncestorNetwork(cousinMarriage(), 'R');
    const cone = descentCone(network, 'C');
    expect(Array.from(cone.people).sort()).toEqual(['A', 'C', 'R']);
    expect(Array.from(cone.unions).sort()).toEqual(['fAB', 'fCD']);
  });

  it('walks up without wandering into a sibling branch', () => {
    const network = buildAncestorNetwork(cousinMarriage(), 'R');
    const cone = ancestorCone(network, 'C');
    // C's own ancestry: his parents, not his brother E and not E's descendants.
    expect(Array.from(cone.people).sort()).toEqual(['C', 'G', 'H']);
    expect(Array.from(cone.unions).sort()).toEqual(['fGH']);
  });

  it('joins the two halves into one line, and names who married into it', () => {
    const network = buildAncestorNetwork(cousinMarriage(), 'R');
    const line = lineThrough(network, 'C');
    // Up: C, G, H. Down: C, A, R. Nothing from the E branch.
    expect(Array.from(line.blood).sort()).toEqual(['A', 'C', 'G', 'H', 'R']);
    // D married C, and B married A. Both are on the chart, neither is blood.
    expect(Array.from(line.partners).sort()).toEqual(['B', 'D']);
    expect(Array.from(line.unions).sort()).toEqual(['fAB', 'fCD', 'fGH']);
  });

  it('has no partners when the line is the whole ancestry', () => {
    const network = buildAncestorNetwork(cousinMarriage(), 'R');
    const line = lineThrough(network, 'R');
    expect(line.blood.size).toBe(9);
    expect(Array.from(line.partners)).toEqual([]);
  });

  it('is empty when the root is not in the file', () => {
    expect(buildAncestorNetwork(cousinMarriage(), 'nobody').persons.size).toBe(
      0,
    );
  });
});
