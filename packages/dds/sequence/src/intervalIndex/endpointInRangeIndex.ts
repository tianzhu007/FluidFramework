/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-deprecated */

import { Client, PropertyAction, RedBlackTree } from "@fluidframework/merge-tree/internal";

import {
	ISerializableInterval,
	IntervalType,
	SequenceInterval,
	createSequenceInterval,
} from "../intervals/index.js";
import { ISharedString } from "../sharedString.js";

import { IntervalIndex } from "./intervalIndex.js";
import {
	HasComparisonOverride,
	compareOverrideables,
	forceCompare,
} from "./intervalIndexUtils.js";

/**
 * Collection of intervals.
 *
 * Provide additional APIs to support efficiently querying a collection of intervals whose endpoints fall within a specified range.
 * @internal
 */
export interface IEndpointInRangeIndex<TInterval extends ISerializableInterval>
	extends IntervalIndex<TInterval> {
	/**
	 * @returns an array of all intervals contained in this collection whose endpoints locate in the range [start, end] (includes both ends)
	 */
	findIntervalsWithEndpointInRange(start: number, end: number): TInterval[];
}

export class EndpointInRangeIndex implements IEndpointInRangeIndex<SequenceInterval> {
	private readonly intervalTree;

	constructor(private readonly client: Client) {
		this.intervalTree = new RedBlackTree<SequenceInterval, SequenceInterval>(
			(a: SequenceInterval, b: SequenceInterval) => {
				const compareEndsResult = a.compareEnd(b);
				if (compareEndsResult !== 0) {
					return compareEndsResult;
				}

				const overrideablesComparison = compareOverrideables(
					a as Partial<HasComparisonOverride>,
					b as Partial<HasComparisonOverride>,
				);
				if (overrideablesComparison !== 0) {
					return overrideablesComparison;
				}

				const aId = a.getIntervalId();
				const bId = b.getIntervalId();
				if (aId !== undefined && bId !== undefined) {
					return aId.localeCompare(bId);
				}
				return 0;
			},
		);
	}

	public add(interval: SequenceInterval): void {
		this.intervalTree.put(interval, interval);
	}

	public remove(interval: SequenceInterval): void {
		this.intervalTree.remove(interval);
	}

	public findIntervalsWithEndpointInRange(start: number, end: number): SequenceInterval[] {
		if (start <= 0 || start > end || this.intervalTree.isEmpty()) {
			return [];
		}
		const results: SequenceInterval[] = [];
		const action: PropertyAction<SequenceInterval, SequenceInterval> = (node) => {
			results.push(node.data);
			return true;
		};

		const transientStartInterval = createSequenceInterval(
			"transient",
			start,
			start,
			this.client,
			IntervalType.Transient,
		);

		const transientEndInterval = createSequenceInterval(
			"transient",
			end,
			end,
			this.client,
			IntervalType.Transient,
		);

		// Add comparison overrides to the transient intervals
		(transientStartInterval as Partial<HasComparisonOverride>)[forceCompare] = -1;
		(transientEndInterval as Partial<HasComparisonOverride>)[forceCompare] = 1;

		this.intervalTree.mapRange(action, results, transientStartInterval, transientEndInterval);
		return results;
	}
}

/**
 * @internal
 */
export function createEndpointInRangeIndex(
	sharedString: ISharedString,
): IEndpointInRangeIndex<SequenceInterval> {
	const client = (sharedString as unknown as { client: Client }).client;
	return new EndpointInRangeIndex(client);
}
