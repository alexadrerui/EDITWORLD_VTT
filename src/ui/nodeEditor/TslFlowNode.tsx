import { Handle, Position, useNodeConnections, type NodeProps, type Node } from '@xyflow/react'
import { TSL_NODE_REGISTRY } from './compileTslGraph'
import { useNodeEditorActions } from './nodeEditorContext'
import type { TslFlowNodeData } from './reactFlowAdapters'

// One generic node component for every TslNodeType, parametrized entirely by
// TSL_NODE_REGISTRY[data.nodeType] — mirrors how SceneObjectMesh.tsx has one
// mesh-building path per PrimitiveKind driven by primitives.ts, rather than
// one React component per kind.
export function TslFlowNode({ id, data }: NodeProps<Node<TslFlowNodeData>>) {
  const def = TSL_NODE_REGISTRY[data.nodeType]
  const { updateParam, commitGraph } = useNodeEditorActions()

  return (
    <div className="tsl-node" onBlur={commitGraph}>
      <div className="tsl-node-header">{def.label}</div>

      {def.params.length > 0 && (
        <div className="tsl-node-body">
          {def.params.map((param) => (
            <div className="tsl-node-param-row" key={param.key}>
              <span>{param.label}</span>
              <select
                value={String(data.params[param.key] ?? param.defaultValue)}
                onChange={(e) => {
                  updateParam(id, param.key, e.target.value)
                  commitGraph()
                }}
              >
                {param.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {def.inputs.length > 0 && (
        <div className="tsl-node-body">
          {def.inputs.map((input) => (
            <InputRow
              key={input.name}
              nodeId={id}
              inputName={input.name}
              label={input.label}
              value={data.params[input.name] ?? input.defaultValue}
              // The Material Output node's Color/Position sockets are vec3-
              // typed — an inline scalar editor there would silently do
              // nothing (see compileTslGraph.ts's `output` entry), so it's
              // never shown for that node type.
              showLiteral={data.nodeType !== 'output'}
              onChange={(value) => updateParam(id, input.name, value)}
            />
          ))}
        </div>
      )}

      {def.outputs.length > 0 && (
        <div className="tsl-node-body">
          {def.outputs.map((output) => (
            <div className="tsl-node-output-row" key={output.name}>
              <span>{output.label}</span>
              <Handle type="source" position={Position.Right} id={output.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InputRow({
  nodeId,
  inputName,
  label,
  value,
  showLiteral,
  onChange,
}: {
  nodeId: string
  inputName: string
  label: string
  value: number | string
  showLiteral: boolean
  onChange: (value: string) => void
}) {
  const connections = useNodeConnections({ id: nodeId, handleType: 'target', handleId: inputName })
  const connected = connections.length > 0

  return (
    <div className="tsl-node-input-row">
      <Handle type="target" position={Position.Left} id={inputName} />
      <span>{label}</span>
      {showLiteral && !connected && (
        <input type="number" step={0.1} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}
