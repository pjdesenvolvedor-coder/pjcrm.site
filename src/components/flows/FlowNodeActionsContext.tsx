'use client';

import React, { createContext, useContext } from 'react';

export interface FlowNodeActionsContextType {
    onDeleteNode?: (nodeId: string) => void;
}

export const FlowNodeActionsContext = createContext<FlowNodeActionsContextType>({});

export function useFlowNodeActions() {
    return useContext(FlowNodeActionsContext);
}
