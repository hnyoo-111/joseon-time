import type { King } from './types';

export const KINGS: King[] = [
  { id: 'taejo', name: '태조', order: '1대', reign: '1392–1398' },
  { id: 'sejong', name: '세종', order: '4대', reign: '1418–1450' },
  { id: 'danjong', name: '단종', order: '6대', reign: '1452–1455' },
  { id: 'seonjo', name: '선조', order: '14대', reign: '1567–1608' },
  { id: 'gwanghae', name: '광해군', order: '15대', reign: '1608–1623' },
  { id: 'injo', name: '인조', order: '16대', reign: '1623–1649' },
  { id: 'sukjong', name: '숙종', order: '19대', reign: '1674–1720' },
  { id: 'yeongjo', name: '영조', order: '21대', reign: '1724–1776' },
  { id: 'jeongjo', name: '정조', order: '22대', reign: '1776–1800' },
];

export function kingById(id: string): King | undefined {
  return KINGS.find((k) => k.id === id);
}
