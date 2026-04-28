import type React from "react"
import { useState } from "react"
import { List } from "react-window"
import { type RowComponentProps } from "react-window";
import styles from './index.module.less'


const Row = ({ list, index, style }: RowComponentProps<{ list: number[] }>) => {
  return (
    <div style={style}>{list[index]}</div>
  )
}


const Path: React.FC = () => {

  const [list, setList] = useState<number[]>([])

  const getList = () => {
    setList(new Array(20000).fill(0).map((_, index) => index))
  }


  return (
    <div className={styles.container}>
      <h1>Path</h1>
      <button onClick={getList}>add list</button>
      <List
        rowProps={{ list }}
        rowHeight={200}
        rowComponent={Row}
        rowCount={list.length}
      />
    </div>
  )
}

export default Path
