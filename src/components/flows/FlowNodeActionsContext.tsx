'use client';

import React, { createContext, useContext } from 'react';

export interface FlowNodeActionsContextType {
    onDeleteNode?: (nodeId: string) => void;
    onDuplicateNode?: (nodeId: string, position?: { x: number; y: number }) => void;
    onConfigureNode?: (nodeId: string) => void;
}

export const FlowNodeActionsContext = createContext<FlowNodeActionsContextType>({});

export function useFlowNodeActions() {
    return useContext(FlowNodeActionsContext);
}

